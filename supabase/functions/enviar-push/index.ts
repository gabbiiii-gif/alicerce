// Manda um aviso da tabela notificacoes para os celulares de quem recebe, pelo Firebase
// Cloud Messaging (FCM).
//
// Quem chama é o próprio banco (0018, trigger dispara_push), logo depois de gravar o aviso.
// Chega só o id: o texto, o destinatário e os celulares saem daqui de dentro, com a service
// role. Por isso a função fica aberta, sem JWT nem senha — uma chamada forjada, com o id de
// um aviso de verdade, no máximo repetiria o push dele. E nem isso: a coluna push_em é a
// trava, preenchida no mesmo update que decide quem manda.
//
// Arquivo único de propósito, para poder colar no editor do painel do Supabase.
//
// Secrets:
//   FCM_SERVICE_ACCOUNT  o JSON da conta de serviço do Firebase (Configurações do projeto →
//                        Contas de serviço → Gerar nova chave privada). Pode colar o arquivo
//                        inteiro, como está, ou em base64.
import { createClient } from 'npm:@supabase/supabase-js@2'

type ContaDeServico = { project_id: string; client_email: string; private_key: string }
type Aviso = { id: string; user_id: string; obra_id: string | null; tipo: string; titulo: string; corpo: string | null }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function responde(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

// Devolve a conta, ou o motivo de não ter conseguido ler. O motivo vai na resposta e no log,
// então só cita nomes de campo — nunca o conteúdo do secret.
function lerConta(): { conta: ContaDeServico } | { erro: string } {
  const cru = Deno.env.get('FCM_SERVICE_ACCOUNT')?.trim()
  if (!cru) return { erro: 'FCM_SERVICE_ACCOUNT não configurado (confira o nome em Edge Functions → Secrets)' }
  // O painel às vezes come as quebras de linha ao colar; o JSON continua válido sem elas,
  // porque as da chave privada vêm escritas como \n dentro do texto. E o valor pode chegar de
  // cinco jeitos: como está no arquivo, com aspas em volta (o costume de arquivo .env), como
  // texto JSON escapado ("{\"type\": …}"), sem as chaves das pontas (selecionado da segunda à
  // penúltima linha) ou em base64. O painel não mostra o valor salvo, então é mais fácil
  // aceitar todos do que pedir para colar de novo.
  const interpretar = (t: string) => {
    const v = JSON.parse(t)
    return typeof v === 'string' ? JSON.parse(v) : v
  }
  const formas = [
    () => cru,
    () => (/^(["']).*\1$/s.test(cru) ? cru.slice(1, -1) : null),
    () => (cru.startsWith('"') ? `{${cru.replace(/,\s*$/, '')}}` : null),
    () => new TextDecoder().decode(Uint8Array.from(atob(cru), c => c.charCodeAt(0))),
  ]
  let campos: string[] | null = null
  for (const forma of formas) {
    try {
      const t = forma()
      if (t === null) continue
      const conta = interpretar(t)
      if (conta?.project_id && conta?.client_email && conta?.private_key) return { conta }
      if (conta && typeof conta === 'object') campos = Object.keys(conta)
    } catch {
      /* tenta o próximo formato */
    }
  }
  if (campos) {
    const faltam = ['project_id', 'client_email', 'private_key'].filter(c => !campos!.includes(c))
    return { erro: `FCM_SERVICE_ACCOUNT não é a chave da conta de serviço: faltam ${faltam.join(', ')}` }
  }
  return {
    erro: `FCM_SERVICE_ACCOUNT existe, mas não é um JSON válido (${cru.length} caracteres, começa com "${cru.slice(0, 1)}"). Cole o arquivo inteiro de novo`,
  }
}

// ---------------------------------------------------------------- acesso ao Google

function base64url(bytes: Uint8Array | ArrayBuffer): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let s = ''
  for (const byte of b) s += String.fromCharCode(byte)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const texto = (s: string) => base64url(new TextEncoder().encode(s))

// O token do Google vale uma hora. A instância da função costuma atender vários avisos
// seguidos, então ele fica guardado aqui até perto de vencer.
let guardado: { token: string; vence: number } | null = null

async function tokenDoGoogle(conta: ContaDeServico): Promise<string> {
  if (guardado && guardado.vence > Date.now() + 60_000) return guardado.token

  const agora = Math.floor(Date.now() / 1000)
  const cabecalho = texto(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const pedido = texto(
    JSON.stringify({
      iss: conta.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: agora,
      exp: agora + 3600,
    }),
  )
  const pem = conta.private_key.replace(/-----[^-]+-----/g, '').replace(/\\n|\s/g, '')
  const chave = await crypto.subtle.importKey(
    'pkcs8',
    Uint8Array.from(atob(pem), c => c.charCodeAt(0)),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const assinatura = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', chave, new TextEncoder().encode(`${cabecalho}.${pedido}`))

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${cabecalho}.${pedido}.${base64url(assinatura)}`,
    }),
  })
  const corpo = await r.json().catch(() => null)
  if (!r.ok || !corpo?.access_token) {
    throw new Error(`o Google recusou a conta de serviço (${r.status} ${corpo?.error ?? ''})`)
  }
  guardado = { token: corpo.access_token, vence: Date.now() + (Number(corpo.expires_in) || 3600) * 1000 }
  return guardado.token
}

// ---------------------------------------------------------------- a mensagem

// O aviso com a cara do Alicerce: a obra no título, o que aconteceu (com o valor) logo
// abaixo, e o detalhe numa segunda linha, que aparece ao abrir o aviso. O banco grava o
// corpo começando pelo nome da obra (0017); aqui ele já está no título, então sai do corpo.
export function montar(aviso: Aviso, obra: string | null): { titulo: string; corpo: string } {
  if (!obra) return { titulo: aviso.titulo, corpo: aviso.corpo ?? '' }
  const prefixo = `${obra} · `
  const corpo = aviso.corpo ?? ''
  const detalhe = corpo === obra ? '' : corpo.startsWith(prefixo) ? corpo.slice(prefixo.length) : corpo
  return { titulo: obra, corpo: [aviso.titulo, detalhe].filter(Boolean).join('\n') }
}

// Para onde o toque no aviso leva. A mesma regra da tela de notificações do app.
function destino(aviso: Aviso): string {
  if (aviso.tipo.startsWith('socio_')) return '/perfil'
  if (aviso.tipo === 'plano_renovado') return '/plano'
  if (aviso.obra_id && !aviso.tipo.startsWith('categoria_')) return `/obra/${aviso.obra_id}`
  return '/notificacoes'
}

// Respostas do FCM que querem dizer "este celular não existe mais": o app foi desinstalado,
// os dados foram limpos, ou o token é de outro projeto do Firebase.
function tokenMorto(status: number, corpo: unknown): boolean {
  const erro = (corpo as { error?: { status?: string; details?: { errorCode?: string }[] } })?.error
  const codigos = [erro?.status, ...(erro?.details ?? []).map(d => d.errorCode)]
  return status === 404 || codigos.some(c => c === 'UNREGISTERED' || c === 'SENDER_ID_MISMATCH' || c === 'INVALID_ARGUMENT')
}

async function mandar(
  conta: ContaDeServico,
  acesso: string,
  token: string,
  aviso: Aviso,
  obra: string | null,
  naoLidas: number,
) {
  const { titulo, corpo } = montar(aviso, obra)
  const r = await fetch(`https://fcm.googleapis.com/v1/projects/${conta.project_id}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${acesso}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        token,
        notification: { title: titulo, body: corpo },
        // Tudo em data é texto: o FCM recusa número e objeto aqui.
        data: { url: destino(aviso), notificacao_id: aviso.id, tipo: aviso.tipo },
        android: {
          // Alta: chega na hora mesmo com o celular em economia de bateria.
          priority: 'high',
          notification: {
            // Canal criado pelo app (lib/push.ts), com o toque do Alicerce. O som daqui só
            // vale no Android 7; do 8 em diante quem manda é o canal.
            channel_id: 'equipe',
            sound: 'alicerce',
            // A marca na barra de status, no azul do app. Os mesmos do AndroidManifest,
            // repetidos para não depender de o APK estar atualizado.
            icon: 'ic_stat_alicerce',
            color: '#1B8FE8',
            notification_count: naoLidas,
          },
        },
      },
    }),
  })
  const resposta = await r.json().catch(() => null)
  return { ok: r.ok, morto: !r.ok && tokenMorto(r.status, resposta), status: r.status }
}

// ---------------------------------------------------------------- entrada

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return responde({ erro: 'use POST' }, 405)

  const { id } = await req.json().catch(() => ({ id: null }))
  if (typeof id !== 'string' || !UUID.test(id)) return responde({ erro: 'id inválido' }, 400)

  // Antes de travar o aviso: sem a conta configurada, ele não pode ficar marcado como enviado.
  const lida = lerConta()
  if ('erro' in lida) {
    console.error(lida.erro)
    return responde({ erro: lida.erro }, 500)
  }
  const { conta } = lida

  const servico = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // A trava: só a primeira chamada acha push_em vazio.
  const { data: aviso, error } = await servico
    .from('notificacoes')
    .update({ push_em: new Date().toISOString() })
    .eq('id', id)
    .is('push_em', null)
    .select('id, user_id, obra_id, tipo, titulo, corpo')
    .maybeSingle()
  if (error) return responde({ erro: error.message }, 500)
  if (!aviso) return responde({ ignorado: 'aviso inexistente ou já enviado' })

  const [aparelhos, porLer, daObra] = await Promise.all([
    servico.from('dispositivos').select('token').eq('user_id', aviso.user_id),
    servico.from('notificacoes').select('id', { count: 'exact', head: true }).eq('user_id', aviso.user_id).is('lida_em', null),
    aviso.obra_id
      ? servico.from('obras').select('nome').eq('id', aviso.obra_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  const tokens = (aparelhos.data ?? []).map(a => a.token as string)
  if (!tokens.length) return responde({ enviados: 0 })
  const obra = (daObra.data as { nome: string } | null)?.nome ?? null

  try {
    const acesso = await tokenDoGoogle(conta)
    const resultados = await Promise.all(
      tokens.map(t => mandar(conta, acesso, t, aviso as Aviso, obra, porLer.count ?? 1)),
    )

    const mortos = tokens.filter((_, i) => resultados[i].morto)
    if (mortos.length) await servico.from('dispositivos').delete().in('token', mortos)

    const falhas = resultados.filter(r => !r.ok && !r.morto).map(r => r.status)
    if (falhas.length) console.warn('push não entregue', { aviso: aviso.id, falhas })
    return responde({ enviados: resultados.filter(r => r.ok).length, descartados: mortos.length, falhas })
  } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e)
    console.error('push falhou', { aviso: aviso.id, motivo })
    return responde({ erro: motivo }, 502)
  }
})
