// Aviso com o app fechado no iPhone e nos navegadores: Web Push.
//
// No iPhone só existe no app aberto pelo ícone da Tela de Início (iOS 16.4 em diante): numa
// aba do Safari o navegador nem oferece. O aviso em si é montado pelo service worker
// (public/push-sw.js); aqui o app pede a permissão, assina o push e registra a assinatura na
// conta de quem entrou (a mesma tabela dos celulares Android, com plataforma 'web').
//
// Este arquivo entra sempre por import dinâmico, nunca no caminho da primeira tela.
import { esquecerAparelho, registrarAparelho } from '../data/api'
import { ehIphone, instaladoNaTelaDeInicio } from './plataforma'
import type { EstadoPush } from './push'

// Chave pública VAPID do Alicerce, a mesma da função enviar-push. A privada fica só no
// secret VAPID_PRIVATE_KEY. VITE_VAPID_PUBLIC_KEY serve para testar com outro par.
const VAPID_PUBLICA =
  import.meta.env.VITE_VAPID_PUBLIC_KEY || 'BDR7tE9ilvYxMYg9qcwpeyHHSFObLD1GKHxI5v01uHp6hCBRslgsfBXPYPQ1AXOgYE5ZKHcrR4IhQ3Ht2jGHNRs'

// A escolha é do aparelho, como no Android (lib/push.ts).
const PREFERENCIA = 'alicerce:webpush'
const TOKEN = 'alicerce:webpush-token'

function ler(chave: string): string | null {
  try {
    return localStorage.getItem(chave)
  } catch {
    return null
  }
}

function gravar(chave: string, valor: string) {
  try {
    localStorage.setItem(chave, valor)
  } catch {
    /* sem armazenamento: o aviso funciona, só não lembra a escolha */
  }
}

const suporta = () =>
  import.meta.env.PROD && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

function chaveDoApp(): Uint8Array<ArrayBuffer> {
  const base64 = VAPID_PUBLICA.replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4)), c => c.charCodeAt(0))
}

// O main.tsx registra o service worker depois que a primeira tela assenta; quem chega aqui
// antes disso registra agora. Registrar de novo o mesmo arquivo não cria outro.
async function registro(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register('/sw.js').catch(() => {})
  return navigator.serviceWorker.ready
}

// Assinatura feita com outra chave (se um dia o par VAPID for trocado) não recebe nada.
function mesmaChave(assinatura: PushSubscription): boolean {
  const usada = assinatura.options?.applicationServerKey
  if (!usada) return true
  const a = new Uint8Array(usada)
  const b = chaveDoApp()
  return a.length === b.length && a.every((v, i) => v === b[i])
}

export async function estadoWeb(): Promise<EstadoPush> {
  // No iPhone, fora da Tela de Início o Safari não tem push: o caminho é instalar.
  if (!suporta()) return ehIphone() && !instaladoNaTelaDeInicio() ? 'instalar' : 'sem-suporte'
  if (Notification.permission === 'denied') return 'bloqueado'
  if (Notification.permission !== 'granted' || ler(PREFERENCIA) !== 'ligado') return 'desligado'
  const assinatura = await (await registro()).pushManager.getSubscription()
  return assinatura ? 'ligado' : 'desligado'
}

async function registrarAssinatura(assinatura: PushSubscription) {
  const token = JSON.stringify(assinatura.toJSON())
  await registrarAparelho(token, 'web')
  gravar(TOKEN, token)
}

// Liga o aviso neste aparelho. Precisa ser chamada direto do toque da pessoa: o iPhone só
// mostra o pedido de permissão em resposta a um toque, e por isso o pedido é a primeira coisa
// que acontece aqui, antes de qualquer espera.
export async function ligarWeb(): Promise<EstadoPush> {
  if (!suporta()) return estadoWeb()
  const permissao = await Notification.requestPermission()
  if (permissao !== 'granted') {
    gravar(PREFERENCIA, 'desligado')
    return permissao === 'denied' ? 'bloqueado' : 'desligado'
  }
  const reg = await registro()
  let assinatura = await reg.pushManager.getSubscription()
  if (assinatura && !mesmaChave(assinatura)) {
    await assinatura.unsubscribe().catch(() => {})
    assinatura = null
  }
  assinatura ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveDoApp() })
  await registrarAssinatura(assinatura)
  gravar(PREFERENCIA, 'ligado')
  return 'ligado'
}

export async function desligarWeb(): Promise<EstadoPush> {
  const token = ler(TOKEN)
  if (token) await esquecerAparelho(token)
  if (suporta()) {
    const assinatura = await (await registro()).pushManager.getSubscription()
    await assinatura?.unsubscribe().catch(() => {})
  }
  gravar(PREFERENCIA, 'desligado')
  return 'desligado'
}

// Ao sair da conta. Três segundos no máximo, como no Android.
export async function esquecerWebNesteAparelho() {
  const token = ler(TOKEN)
  if (!token) return
  await Promise.race([esquecerAparelho(token).catch(() => {}), new Promise(pronto => setTimeout(pronto, 3000))])
}

// Na abertura, com o aviso ligado: confere se a assinatura continua de pé e manda a atual
// para o banco. O navegador troca a assinatura de vez em quando, e a conta pode ter mudado.
// Nunca pede permissão aqui — no navegador, isso só com o toque da pessoa (Perfil).
export async function iniciarWeb() {
  if (!suporta() || ler(PREFERENCIA) !== 'ligado' || Notification.permission !== 'granted') return
  const reg = await registro()
  let assinatura = await reg.pushManager.getSubscription()
  if (assinatura && !mesmaChave(assinatura)) {
    await assinatura.unsubscribe().catch(() => {})
    assinatura = null
  }
  assinatura ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveDoApp() }).catch(() => null)
  if (assinatura) await registrarAssinatura(assinatura)
}
