// Aviso com o app fechado (push). No APK do Android, pelo Firebase Cloud Messaging (este
// arquivo); no iPhone e nos navegadores, por Web Push (lib/webPush.ts). As telas falam só com
// este arquivo, que escolhe o caminho.
//
// Quem manda é o servidor (0018 + função enviar-push). Aqui o app só faz três coisas: pede a
// permissão, registra o celular na conta de quem entrou e, quando a pessoa toca no aviso,
// abre a tela certa.
//
// O caminho do Firebase só existe no APK que já traz o plugin nativo. O site é o mesmo para todo mundo — inclusive
// para os APKs antigos, que carregam as telas do endereço publicado (capacitor.config.ts) —,
// então a pergunta não é "estou no Android?", e sim "este APK tem o plugin?".
//
// Este arquivo entra sempre por import dinâmico, nunca no caminho da primeira tela.
import { Capacitor, type PluginListenerHandle } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { esquecerAparelho, marcarNotificacoesLidas, registrarAparelho } from '../data/api'
import { ehNativo } from './plataforma'
import { desligarWeb, esquecerWebNesteAparelho, estadoWeb, iniciarWeb, ligarWeb } from './webPush'

export type EstadoPush =
  | 'sem-suporte' // navegador sem push (ou o app rodando em desenvolvimento)
  | 'instalar' // iPhone numa aba do Safari: o push só existe no app da Tela de Início
  | 'atualizar-app' // APK antigo, sem o plugin: precisa instalar o novo
  | 'ligado'
  | 'desligado'
  | 'bloqueado' // a pessoa negou a permissão; só volta pelas configurações do Android

// A escolha é do aparelho, não da conta: quem desliga no celular dele não quer receber ali,
// entre com a conta que for. Ausente = ainda não perguntamos.
const PREFERENCIA = 'alicerce:push'
const TOKEN = 'alicerce:push-token'

// O canal guarda o som e a importância, e o Android não deixa mudar depois de criado. Um som
// novo precisa de um canal com outro id (e o mesmo id na função enviar-push e no manifest).
const CANAL = 'equipe'

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
    /* sem armazenamento: o celular pergunta de novo na próxima abertura */
  }
}

const temPlugin = () => ehNativo() && Capacitor.isPluginAvailable('PushNotifications')

export async function estadoDoPush(): Promise<EstadoPush> {
  if (!ehNativo()) return estadoWeb()
  if (!temPlugin()) return 'atualizar-app'
  const { receive } = await PushNotifications.checkPermissions()
  if (receive === 'denied') return 'bloqueado'
  return receive === 'granted' && ler(PREFERENCIA) === 'ligado' ? 'ligado' : 'desligado'
}

// O canal "equipe": aviso que aparece por cima da tela, com o toque do Alicerce
// (res/raw/alicerce.wav) e a luz no azul do app, nos celulares que têm luz.
async function criarCanal() {
  await PushNotifications.createChannel({
    id: CANAL,
    name: 'Movimentações da equipe',
    description: 'O que o sócio lança e muda nas obras',
    importance: 4,
    // Na tela de bloqueio, quem decide se o valor aparece é a configuração "ocultar conteúdo
    // sensível" do próprio Android.
    visibility: 0,
    sound: 'alicerce.wav',
    vibration: true,
    lights: true,
    lightColor: '#1B8FE8',
  }).catch(() => {})
}

// O token do celular no Firebase. Chega por evento, não pelo retorno de register().
function pedirToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    const ouvintes: PluginListenerHandle[] = []
    const fim = () => ouvintes.forEach(o => o.remove())
    const espera = setTimeout(() => {
      fim()
      reject(new Error('o Firebase não respondeu'))
    }, 20_000)
    Promise.all([
      PushNotifications.addListener('registration', t => {
        clearTimeout(espera)
        fim()
        resolve(t.value)
      }),
      PushNotifications.addListener('registrationError', e => {
        clearTimeout(espera)
        fim()
        reject(new Error(e.error))
      }),
    ])
      .then(lista => {
        ouvintes.push(...lista)
        return PushNotifications.register()
      })
      .catch(e => {
        clearTimeout(espera)
        fim()
        reject(e)
      })
  })
}

// Liga o aviso neste celular: pede a permissão (se ainda não tem), cria o canal e registra
// o celular na conta da sessão. No navegador, quem chama precisa estar no toque da pessoa e
// chamar direto, sem esperar nada antes (lib/webPush.ts, ligarWeb).
export async function ligarPush(): Promise<EstadoPush> {
  if (!ehNativo()) return ligarWeb()
  if (!temPlugin()) return estadoDoPush()
  let { receive } = await PushNotifications.checkPermissions()
  if (receive !== 'granted') receive = (await PushNotifications.requestPermissions()).receive
  if (receive !== 'granted') {
    // Perguntado e recusado: não pergunta sozinho de novo. O caminho de volta é o Perfil.
    gravar(PREFERENCIA, 'desligado')
    return receive === 'denied' ? 'bloqueado' : 'desligado'
  }
  await criarCanal()
  const token = await pedirToken()
  await registrarAparelho(token, 'android')
  gravar(TOKEN, token)
  gravar(PREFERENCIA, 'ligado')
  return 'ligado'
}

// Desliga só neste celular. O token continua no aparelho para religar sem pedir de novo.
export async function desligarPush(): Promise<EstadoPush> {
  if (!ehNativo()) return desligarWeb()
  const token = ler(TOKEN)
  if (token) await esquecerAparelho(token)
  gravar(PREFERENCIA, 'desligado')
  return 'desligado'
}

// Ao sair da conta: o celular para de receber os avisos dela. Precisa rodar ANTES de a sessão
// acabar — sem sessão, o banco não deixa apagar. Três segundos no máximo: sem sinal, sair da
// conta não pode ficar preso nisto (quem entrar depois no aparelho toma o token para si).
export async function esquecerNesteAparelho() {
  if (!ehNativo()) return esquecerWebNesteAparelho()
  const token = ler(TOKEN)
  if (!token || !temPlugin()) return
  await Promise.race([esquecerAparelho(token).catch(() => {}), new Promise(pronto => setTimeout(pronto, 3000))])
}

// Só caminho de dentro do app: o `url` vem do aviso, e um "//outro-site" viraria outra origem.
const caminhoSeguro = (url: unknown): url is string =>
  typeof url === 'string' && url.startsWith('/') && !url.startsWith('//')

// Chamado quando a pessoa entra: ouve o toque no aviso, acompanha a troca de token e, na
// primeira vez neste celular, pede a permissão. Devolve a função que desliga os ouvintes.
export function iniciarPush({ navegar, aoLer }: { navegar: (caminho: string) => void; aoLer: () => void }) {
  if (!ehNativo()) {
    // No navegador o toque no aviso chega pelo service worker (lib/notificacoes.tsx); aqui só
    // confere a assinatura.
    iniciarWeb().catch(() => {})
    return () => {}
  }
  if (!temPlugin()) return () => {}
  let ativo = true
  const ouvintes: PluginListenerHandle[] = []

  ;(async () => {
    // Tocou no aviso: marca como lido e abre a obra. O Android guarda esse toque até alguém
    // ouvir, então funciona também quando o toque é o que abriu o app.
    ouvintes.push(
      await PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
        const dados = (notification.data ?? {}) as { url?: unknown; notificacao_id?: unknown }
        if (typeof dados.notificacao_id === 'string') {
          marcarNotificacoesLidas([dados.notificacao_id]).then(aoLer).catch(() => {})
        }
        if (caminhoSeguro(dados.url)) navegar(dados.url)
      }),
    )
    // O Firebase troca o token de vez em quando. O novo precisa chegar ao banco, senão o
    // celular para de receber sem ninguém saber por quê.
    ouvintes.push(
      await PushNotifications.addListener('registration', ({ value }) => {
        if (ler(PREFERENCIA) !== 'ligado' || value === ler(TOKEN)) return
        registrarAparelho(value, 'android')
          .then(() => gravar(TOKEN, value))
          .catch(() => {})
      }),
    )
    if (!ativo) {
      ouvintes.forEach(o => o.remove())
      return
    }

    const preferencia = ler(PREFERENCIA)
    if (preferencia === 'desligado') return
    const { receive } = await PushNotifications.checkPermissions()
    // Com a permissão já dada (Android 12 para baixo dá sozinho), liga sem perguntar nada — e
    // a cada abertura, para o token no banco ser sempre o atual. Sem permissão, pergunta uma
    // vez só neste celular.
    if (receive === 'granted' || (preferencia === null && receive !== 'denied')) {
      await ligarPush().catch(() => {})
    }
  })().catch(() => {})

  return () => {
    ativo = false
    ouvintes.forEach(o => o.remove())
  }
}
