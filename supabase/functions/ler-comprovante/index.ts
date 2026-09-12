// Agente do Alicerce: lê a nota enviada pelo usuário e devolve fornecedor, valor, data
// e uma sugestão de categoria vinda da lista real da obra.
import Anthropic from 'npm:@anthropic-ai/sdk@0.125.0'
import { zodOutputFormat } from 'npm:@anthropic-ai/sdk@0.125.0/helpers/zod'
import { createClient } from 'npm:@supabase/supabase-js@2'
// O subpath /v4 nao e detalhe: `zodOutputFormat` do SDK faz `import * as z from 'zod/v4'`,
// e um schema montado com o namespace v3 chega la com outro formato interno — o erro que
// aparecia na nota era exatamente isso ("cannot read properties of undefined (reading '_def')").
import { z } from 'npm:zod@3.25.76/v4'

const MODELO = Deno.env.get('ALICERCE_MODELO') ?? 'claude-sonnet-5'

const NotaLida = z.object({
  fornecedor: z.string().describe('Nome de quem emitiu a nota, como aparece no documento'),
  valor: z.number().describe('Valor total pago, em reais, com centavos'),
  data: z.string().describe('Data do documento no formato AAAA-MM-DD'),
  categoria_sugerida: z.string().describe('Uma das categorias oferecidas, ou string vazia se nenhuma servir'),
  confianca: z.enum(['alta', 'media', 'baixa']).describe('Quanto o documento sustenta essa leitura'),
})

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function responde(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const autorizacao = req.headers.get('Authorization')
  if (!autorizacao) return responde({ erro: 'sem credencial' }, 401)

  const url = Deno.env.get('SUPABASE_URL')!
  const servico = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const comoUsuario = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: autorizacao } },
  })

  const { data: auth } = await comoUsuario.auth.getUser()
  if (!auth?.user) return responde({ erro: 'sessão inválida' }, 401)

  const { comprovante_id } = await req.json().catch(() => ({ comprovante_id: null }))
  if (!comprovante_id) return responde({ erro: 'informe comprovante_id' }, 400)

  const { data: comprovante, error: erroComprovante } = await servico
    .from('comprovantes')
    .select('id, obra_id, autor_id, storage_path, mime')
    .eq('id', comprovante_id)
    .single()

  if (erroComprovante || !comprovante) return responde({ erro: 'comprovante não encontrado' }, 404)
  if (comprovante.autor_id !== auth.user.id) return responde({ erro: 'esse comprovante não é seu' }, 403)

  try {
    const { data: arquivo, error: erroArquivo } = await servico.storage
      .from('comprovantes')
      .download(comprovante.storage_path)
    if (erroArquivo || !arquivo) throw new Error('não deu para abrir o arquivo enviado')

    const bytes = new Uint8Array(await arquivo.arrayBuffer())
    let binario = ''
    for (let i = 0; i < bytes.length; i += 8192) {
      binario += String.fromCharCode(...bytes.subarray(i, i + 8192))
    }
    const base64 = btoa(binario)
    const mime = comprovante.mime || arquivo.type || 'image/jpeg'

    // A sugestão de categoria só pode sair da lista que os usuários realmente mantêm.
    const { data: obra } = await servico.from('obras').select('dono_id').eq('id', comprovante.obra_id).single()
    const { data: categorias } = await servico.from('categorias').select('nome').eq('dono_id', obra?.dono_id ?? '')
    const nomes = (categorias ?? []).map(c => c.nome as string)

    // Uma chave criada fora de um workspace não diz sozinha a qual workspace cobrar, e a
    // API recusa com 400 pedindo o header. Com ANTHROPIC_WORKSPACE_ID definido, mandamos o
    // header; sem ele, seguimos direto — que é o caminho de quem usa uma chave já criada
    // dentro de um workspace, onde o header é desnecessário.
    const workspace = Deno.env.get('ANTHROPIC_WORKSPACE_ID')
    const anthropic = new Anthropic({
      apiKey: Deno.env.get('ANTHROPIC_API_KEY')!,
      ...(workspace ? { defaultHeaders: { 'anthropic-workspace-id': workspace } } : {}),
    })

    const documento = mime === 'application/pdf'
      ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: base64 } }
      : { type: 'image' as const, source: { type: 'base64' as const, media_type: mime as 'image/jpeg', data: base64 } }

    const hoje = new Date().toISOString().slice(0, 10)
    const resposta = await anthropic.messages.parse({
      model: MODELO,
      max_tokens: 4000,
      system:
        'Você lê comprovantes de gasto de obra no Brasil: notas fiscais, cupons, boletos e recibos. ' +
        'Extraia apenas o que está no documento. Valor é o total pago, em reais. ' +
        'Se a data estiver incompleta ou ilegível, use a data de hoje e marque a confiança como baixa.',
      messages: [
        {
          role: 'user',
          content: [
            documento,
            {
              type: 'text',
              text:
                `Hoje é ${hoje}. Leia este comprovante e devolva fornecedor, valor total, data e a categoria mais provável.\n` +
                (nomes.length
                  ? `Categorias disponíveis (escolha exatamente uma, ou deixe vazio se nenhuma servir): ${nomes.join(', ')}.`
                  : 'Não há lista de categorias: devolva categoria_sugerida vazia.'),
            },
          ],
        },
      ],
      output_config: { format: zodOutputFormat(NotaLida) },
    })

    const lido = resposta.parsed_output
    if (!lido) throw new Error('o agente não conseguiu estruturar a leitura')

    const extraido = {
      fornecedor: lido.fornecedor || null,
      valor: Number.isFinite(lido.valor) ? lido.valor : null,
      data: /^\d{4}-\d{2}-\d{2}$/.test(lido.data) ? lido.data : hoje,
      categoria_sugerida: nomes.includes(lido.categoria_sugerida) ? lido.categoria_sugerida : null,
      confianca: lido.confianca,
    }

    await servico.from('comprovantes').update({ status: 'pronto', extraido, erro: null }).eq('id', comprovante.id)
    return responde({ status: 'pronto', extraido })
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : 'falha ao ler o comprovante'
    // Falhou a leitura: a nota continua na fila para o usuário preencher na mão.
    await servico.from('comprovantes').update({ status: 'erro', erro: mensagem }).eq('id', comprovante.id)
    return responde({ status: 'erro', erro: mensagem }, 200)
  }
})
