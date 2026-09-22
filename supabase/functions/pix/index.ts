// Gera o Pix do plano e confere se ele já foi pago.
//
// Quem paga é decidido pela SESSÃO de quem chamou, nunca pelo corpo do pedido — senão
// bastaria trocar um id para creditar o pagamento no grupo de outra pessoa.
//
// Arquivo único de propósito, sem import de _shared: assim a função pode ser publicada
// colando no editor do painel do Supabase, sem CLI. A conferência do pagamento existe
// igual em mercadopago-webhook — mudou aqui, muda lá.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

// O preço mora no servidor. Vindo do app, bastaria mandar 0,01 para pagar um mês.
const PRECO = 150

const API = 'https://api.mercadopago.com/v1/payments'

function token() {
  const t = Deno.env.get('MP_ACCESS_TOKEN')
  if (!t) throw new Error('MP_ACCESS_TOKEN não configurado')
  return t
}

// O Mercado Pago quer a data com fuso explícito; o "Z" do toISOString nem sempre passa.
function paraBrasilia(ms: number) {
  return new Date(ms - 3 * 3600_000).toISOString().replace('Z', '-03:00')
}

type PixCriado = {
  mp_payment_id: string
  status: string
  qr_code: string
  qr_code_base64: string
  expira_em: string
}

async function criarPix(p: { referencia: string; email: string; expiraEm: number }): Promise<PixCriado> {
  const url = Deno.env.get('SUPABASE_URL')!
  const r = await fetch(API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token()}`,
      'Content-Type': 'application/json',
      // A linha de pagamentos serve de chave: repetir a chamada devolve o mesmo Pix em vez
      // de criar um segundo.
      'X-Idempotency-Key': p.referencia,
    },
    body: JSON.stringify({
      transaction_amount: PRECO,
      description: 'Alicerce — plano mensal',
      payment_method_id: 'pix',
      payer: { email: p.email },
      external_reference: p.referencia,
      date_of_expiration: paraBrasilia(p.expiraEm),
      // Sem configurar nada no painel: cada Pix já diz para onde avisar.
      notification_url: `${url}/functions/v1/mercadopago-webhook`,
    }),
  })
  const mp = await r.json().catch(() => null)
  if (!r.ok || !mp?.id) {
    console.error('Mercado Pago recusou o Pix', r.status, mp)
    throw new Error(mp?.message ?? `Mercado Pago respondeu ${r.status}`)
  }
  const dados = mp.point_of_interaction?.transaction_data ?? {}
  return {
    mp_payment_id: String(mp.id),
    status: mp.status,
    qr_code: dados.qr_code,
    qr_code_base64: dados.qr_code_base64,
    expira_em: new Date(p.expiraEm).toISOString(),
  }
}

// Pergunta ao Mercado Pago como está o pagamento e, se aprovado, credita o mês.
//
// É o ÚNICO caminho que libera acesso, e ele nunca acredita no aviso que chegou: busca o
// pagamento pelo id com o nosso token. Um aviso falso, no máximo, faz a gente conferir um
// pagamento de verdade.
async function conferir(servico: SupabaseClient, mpPaymentId: string) {
  const r = await fetch(`${API}/${mpPaymentId}`, { headers: { Authorization: `Bearer ${token()}` } })
  if (!r.ok) throw new Error(`Mercado Pago respondeu ${r.status} ao conferir ${mpPaymentId}`)
  const mp = await r.json()

  if (mp.status === 'approved') {
    const { data, error } = await servico.rpc('creditar_pix', {
      p_mp_payment_id: String(mp.id),
      p_valor: mp.transaction_amount,
    })
    if (error) throw error
    // null aqui é "já tinha sido creditado" — o outro caminho chegou antes. Continua aprovado.
    return { status: 'approved', vale_ate: (data as string | null) ?? null }
  }

  await servico
    .from('pagamentos')
    .update({ status: mp.status })
    .eq('mp_payment_id', String(mp.id))
    .is('pago_em', null)
  return { status: mp.status as string, vale_ate: null }
}

// Tempo para pagar depois de gerar o QR. Passou, o Mercado Pago cancela e a pessoa gera outro.
const VALIDADE_MS = 60 * 60_000

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
  const eu = auth.user.id

  const { acao } = await req.json().catch(() => ({ acao: 'gerar' }))

  try {
    if (acao === 'conferir') {
      // Os Pix ainda em aberto das últimas 24h. Na prática é um só; a tela chama isto a cada
      // poucos segundos enquanto o QR está aberto, para não depender só do webhook.
      const { data: abertos } = await servico
        .from('pagamentos')
        .select('mp_payment_id')
        .eq('titular_id', eu)
        .eq('status', 'pending')
        .gt('criado_em', new Date(Date.now() - 24 * 3600_000).toISOString())
      for (const p of abertos ?? []) {
        const r = await conferir(servico, p.mp_payment_id)
        if (r.status === 'approved') return responde(r)
      }
      return responde({ status: abertos?.length ? 'pending' : 'nenhum', vale_ate: null })
    }

    const { data: perfil } = await servico.from('profiles').select('grupo_id').eq('id', eu).maybeSingle()
    if (!perfil?.grupo_id) return responde({ erro: 'perfil sem grupo' }, 400)

    const { data: assinatura } = await servico
      .from('assinaturas')
      .select('titular_id')
      .eq('grupo_id', perfil.grupo_id)
      .maybeSingle()
    // A tela já esconde o botão do convidado, mas esconder não é impedir.
    if (assinatura?.titular_id && assinatura.titular_id !== eu) {
      return responde({ erro: 'quem paga o plano é quem assinou' }, 403)
    }

    // Um Pix em aberto com folga de tempo é reaproveitado. Sem isto, cada toque no botão
    // gera um QR novo — e a pessoa pode acabar pagando dois.
    const { data: aberto } = await servico
      .from('pagamentos')
      .select('status, valor, qr_code, qr_code_base64, expira_em')
      .eq('titular_id', eu)
      .eq('status', 'pending')
      .gt('expira_em', new Date(Date.now() + 5 * 60_000).toISOString())
      .order('criado_em', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (aberto) return responde(aberto)

    if (!auth.user.email) return responde({ erro: 'sua conta não tem e-mail, e o Mercado Pago exige um' }, 400)

    const { data: linha, error } = await servico
      .from('pagamentos')
      .insert({ titular_id: eu, valor: PRECO })
      .select('id')
      .single()
    if (error) throw error

    try {
      const pix = await criarPix({ referencia: linha.id, email: auth.user.email, expiraEm: Date.now() + VALIDADE_MS })
      await servico.from('pagamentos').update(pix).eq('id', linha.id)
      return responde({
        status: pix.status,
        valor: PRECO,
        qr_code: pix.qr_code,
        qr_code_base64: pix.qr_code_base64,
        expira_em: pix.expira_em,
      })
    } catch (e) {
      await servico.from('pagamentos').update({ status: 'erro' }).eq('id', linha.id)
      throw e
    }
  } catch (e) {
    console.error('falha no pix', e)
    return responde({ erro: e instanceof Error ? e.message : 'não deu para gerar o Pix' }, 500)
  }
})
