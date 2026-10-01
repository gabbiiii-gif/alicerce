// Manda um aviso da tabela notificacoes para os aparelhos de quem recebe: pelo Firebase Cloud
// Messaging (FCM) no APK do Android, e por Web Push no iPhone (app da Tela de Início) e nos
// navegadores.
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
//   VAPID_PRIVATE_KEY    a chave privada do Web Push (43 caracteres). A pública está aqui
//                        embaixo e no app (src/lib/webPush.ts); as duas formam um par.
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

// ---------------------------------------------------------------- Web Push (iPhone e navegador)

// Par VAPID do Alicerce: a pública identifica o app nos serviços de push (Apple, Google,
// Mozilla, Microsoft) e é a mesma que o app usa ao assinar. Trocar exige trocar nos dois
// lugares, e todo mundo precisa ligar o aviso de novo. O secret VAPID_PUBLIC_KEY, se existir,
// passa por cima desta (é o que os testes usam).
const VAPID_PUBLICA = 'BDR7tE9ilvYxMYg9qcwpeyHHSFObLD1GKHxI5v01uHp6hCBRslgsfBXPYPQ1AXOgYE5ZKHcrR4IhQ3Ht2jGHNRs'
const vapidPublica = () => Deno.env.get('VAPID_PUBLIC_KEY')?.trim() || VAPID_PUBLICA
const VAPID_CONTATO = 'https://appalicerce.com.br'

// Só os serviços de push de verdade. O endereço vem do aparelho de quem assinou, e sem esta
// lista daria para registrar um "aparelho" que fizesse a função chamar qualquer endereço.
const SERVICOS_DE_PUSH = [/^fcm\.googleapis\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/]

type AssinaturaWeb = { endpoint: string; keys: { p256dh: string; auth: string } }
// Bytes sobre um ArrayBuffer comum: é o que o WebCrypto e o fetch aceitam.
type Bytes = Uint8Array<ArrayBuffer>

function lerVapid(): string | null {
  // O painel já salvou secret com aspas em volta uma vez; aqui elas não fazem parte da chave.
  const d = Deno.env.get('VAPID_PRIVATE_KEY')?.trim().replace(/^["']|["']$/g, '')
  return d && /^[A-Za-z0-9_-]{43}$/.test(d) ? d : null
}

function deBase64url(s: string): Bytes {
  const base64 = s.replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4)), c => c.charCodeAt(0))
}

const bytes = (s: string): Bytes => new TextEncoder().encode(s) as Bytes

function juntar(...partes: Bytes[]): Bytes {
  const tudo = new Uint8Array(partes.reduce((soma, p) => soma + p.length, 0))
  let posicao = 0
  for (const p of partes) {
    tudo.set(p, posicao)
    posicao += p.length
  }
  return tudo
}

async function hkdf(sal: Bytes, material: Bytes, info: Bytes, tamanho: number): Promise<Bytes> {
  const chave = await crypto.subtle.importKey('raw', material, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: sal, info }, chave, tamanho * 8))
}

// O conteúdo vai cifrado para o aparelho (RFC 8291, aes128gcm): o serviço de push da Apple ou
// do Google entrega, mas não consegue ler. Só o navegador que assinou tem a chave.
export async function cifrar(assinatura: AssinaturaWeb, mensagem: Bytes): Promise<Bytes> {
  const deles = deBase64url(assinatura.keys.p256dh)
  const segredo = deBase64url(assinatura.keys.auth)
  const nossa = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const nossaPublica = new Uint8Array(await crypto.subtle.exportKey('raw', nossa.publicKey))
  const chaveDeles = await crypto.subtle.importKey('raw', deles, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const comum = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: chaveDeles }, nossa.privateKey, 256))

  const material = await hkdf(segredo, comum, juntar(bytes('WebPush: info\0'), deles, nossaPublica), 32)
  const sal = crypto.getRandomValues(new Uint8Array(16))
  const chave = await hkdf(sal, material, bytes('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(sal, material, bytes('Content-Encoding: nonce\0'), 12)

  const aes = await crypto.subtle.importKey('raw', chave, 'AES-GCM', false, ['encrypt'])
  // O 2 no fim marca o último (e único) bloco da mensagem.
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, juntar(mensagem, new Uint8Array([2]))))

  const cabecalho = new Uint8Array(21 + nossaPublica.length)
  cabecalho.set(sal, 0)
  new DataView(cabecalho.buffer).setUint32(16, 4096)
  cabecalho[20] = nossaPublica.length
  cabecalho.set(nossaPublica, 21)
  return juntar(cabecalho, cifrado)
}

// A identificação do Alicerce no serviço de push (RFC 8292): um JWT assinado com a privada.
export async function jwtVapid(endpoint: string, privada: string): Promise<string> {
  const publica = deBase64url(vapidPublica())
  const chave = await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', d: privada, x: base64url(publica.slice(1, 33)), y: base64url(publica.slice(33, 65)) },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
  const cabecalho = texto(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))
  // 12 horas: o máximo que a Apple aceita é um dia.
  const pedido = texto(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: VAPID_CONTATO }))
  const assinatura = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, chave, bytes(`${cabecalho}.${pedido}`))
  return `${cabecalho}.${pedido}.${base64url(assinatura)}`
}

async function mandarWeb(token: string, privada: string, aviso: Aviso, obra: string | null, naoLidas: number) {
  let assinatura: AssinaturaWeb
  try {
    assinatura = JSON.parse(token)
    const url = new URL(assinatura.endpoint)
    if (url.protocol !== 'https:' || !SERVICOS_DE_PUSH.some(s => s.test(url.hostname))) throw new Error('fora da lista')
    if (!assinatura.keys?.p256dh || !assinatura.keys?.auth) throw new Error('sem chaves')
  } catch {
    // Registro que não é uma assinatura de push de verdade: sai da tabela.
    return { ok: false, morto: true, status: 0 }
  }

  const { titulo, corpo } = montar(aviso, obra)
  // O service worker do app (public/push-sw.js) monta o aviso com isto.
  const conteudo = { titulo, corpo, url: destino(aviso), id: aviso.id, naoLidas }
  const r = await fetch(assinatura.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `vapid t=${await jwtVapid(assinatura.endpoint, privada)}, k=${vapidPublica()}`,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      // Um dia: celular desligado na obra recebe quando voltar, até 24 horas depois.
      TTL: '86400',
      Urgency: 'high',
    },
    body: await cifrar(assinatura, bytes(JSON.stringify(conteudo))),
  })
  if (!r.ok) console.warn('web push recusado', r.status, (await r.text().catch(() => '')).slice(0, 200))
  else await r.body?.cancel()
  // 404 e 410: a assinatura não existe mais (app removido da Tela de Início, permissão tirada).
  return { ok: r.ok, morto: r.status === 404 || r.status === 410, status: r.status }
}

// ---------------------------------------------------------------- entrada

const UUID =/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return responde({ erro: 'use POST' }, 405)

  const { id } = await req.json().catch(() => ({ id: null }))
  if (typeof id !== 'string' || !UUID.test(id)) return responde({ erro: 'id inválido' }, 400)

  // Antes de travar o aviso: sem nenhum dos dois caminhos configurado, ele não pode ficar
  // marcado como enviado.
  const lida = lerConta()
  const conta = 'conta' in lida ? lida.conta : null
  const vapid = lerVapid()
  if (!conta && !vapid) {
    const erro = `${'erro' in lida ? lida.erro : ''}; VAPID_PRIVATE_KEY ausente ou inválido`
    console.error(erro)
    return responde({ erro }, 500)
  }

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
    servico.from('dispositivos').select('id, token, plataforma').eq('user_id', aviso.user_id),
    servico.from('notificacoes').select('id', { count: 'exact', head: true }).eq('user_id', aviso.user_id).is('lida_em', null),
    aviso.obra_id
      ? servico.from('obras').select('nome').eq('id', aviso.obra_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  const lista = (aparelhos.data ?? []) as { id: string; token: string; plataforma: string }[]
  if (!lista.length) return responde({ enviados: 0 })
  const obra = (daObra.data as { nome: string } | null)?.nome ?? null
  const naoLidas = porLer.count ?? 1

  // Cada aparelho pelo seu caminho: Android pelo Firebase, iPhone e navegador por Web Push. Um
  // caminho que falha não segura o outro.
  let acessoGoogle: Promise<string> | null = null
  type Resultado = { ok: boolean; morto: boolean; status: number; motivo?: string }
  const resultados: Resultado[] = await Promise.all(
    lista.map(async ({ token, plataforma }): Promise<Resultado> => {
      try {
        if (plataforma === 'web') {
          if (!vapid) return { ok: false, morto: false, status: 0, motivo: 'VAPID_PRIVATE_KEY ausente ou inválido' }
          return await mandarWeb(token, vapid, aviso as Aviso, obra, naoLidas)
        }
        if (!conta) return { ok: false, morto: false, status: 0, motivo: 'erro' in lida ? lida.erro : 'sem conta' }
        acessoGoogle ??= tokenDoGoogle(conta)
        return await mandar(conta, await acessoGoogle, token, aviso as Aviso, obra, naoLidas)
      } catch (e) {
        return { ok: false, morto: false, status: 0, motivo: e instanceof Error ? e.message : String(e) }
      }
    }),
  )

  // Pelo id, não pelo token: o token do Web Push é um JSON, com aspas e vírgulas que o filtro
  // `in` do PostgREST não escapa.
  const mortos = lista.filter((_, i) => resultados[i].morto).map(a => a.id)
  if (mortos.length) await servico.from('dispositivos').delete().in('id', mortos)

  const falhas = resultados.filter(r => !r.ok && !r.morto).map(r => r.motivo ?? r.status)
  if (falhas.length) console.warn('push não entregue', { aviso: aviso.id, falhas })
  return responde({ enviados: resultados.filter(r => r.ok).length, descartados: mortos.length, falhas })
})
