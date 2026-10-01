import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './auth'
import { quandoOcioso } from './agenda'
import { ehNativo } from './plataforma'
import { useAviso } from '../components/Toast'
import type { Notificacao } from './types'

// Os avisos do que a equipe faz (0017): o número no sino, o aviso na hora em que chega e o
// sinal para as telas abertas se atualizarem sozinhas.
//
// Vive num contexto pelo mesmo motivo do plano (lib/plano.tsx): várias telas mostram o
// mesmo número. E, como ele, NÃO importa o Supabase direto — este arquivo entra na
// primeira tela, então a camada de dados vem por import dinâmico, com o celular ocioso.

type Contexto = {
  naoLidas: number
  // Pergunta de novo ao banco quantas faltam ler (depois de marcar como lidas).
  recontar: () => void
}

const NotificacoesContext = createContext<Contexto>({ naoLidas: 0, recontar: () => {} })

// As telas abertas que querem saber quando chega novidade (useNovidades).
const ouvintes = new Set<(novas: Notificacao[]) => void>()

// Com o tempo real fora do ar (rede ruim, Realtime desligado no projeto), o app confere de
// tempos em tempos. Com ele no ar, não confere nada: o aviso chega sozinho.
const INTERVALO_SEM_TEMPO_REAL = 45_000

export function NotificacoesProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const userId = session?.user.id ?? null
  const avisar = useAviso()
  const [naoLidas, setNaoLidas] = useState(0)
  const recontarAgora = useRef<() => void>(() => {})
  // O navigate muda a cada troca de tela; o push só precisa do mais recente.
  const navigate = useNavigate()
  const navegar = useRef(navigate)
  useEffect(() => {
    navegar.current = navigate
  })

  useEffect(() => {
    setNaoLidas(0)
    if (!userId) return
    const eu = userId

    let ativo = true
    let estado: 'parado' | 'ligando' | 'ligado' = 'parado'
    let aoVivo = false
    let caiu = false
    let desligarCanal = () => {}
    let relogio: ReturnType<typeof setInterval> | undefined
    let api: typeof import('../data/api') | null = null
    // Cada aviso passa uma vez só, venha do tempo real ou da conferida na volta ao app.
    const vistas = new Set<string>()
    let desde = new Date(0).toISOString()

    const chegaram = (lista: Notificacao[]) => {
      const novas = lista.filter(n => !vistas.has(n.id))
      if (!ativo || !novas.length) return novas
      novas.forEach(n => {
        vistas.add(n.id)
        if (n.created_at > desde) desde = n.created_at
      })
      ouvintes.forEach(ouvinte => ouvinte(novas))
      // Na tela de notificações a lista já mostra o que chegou; o aviso por cima repetiria.
      if (window.location.pathname !== '/notificacoes') {
        avisar(novas.length === 1 ? novas[0].titulo : `${novas.length} novidades da equipe`)
      }
      return novas
    }

    const contar = () => {
      api?.contarNaoLidas(eu).then(total => ativo && setNaoLidas(total)).catch(() => {})
    }
    recontarAgora.current = contar

    // Com o app em segundo plano, o celular derruba a conexão do tempo real, e o que chegou
    // nesse meio-tempo não vem por ela. Na volta, pergunta o que ficou para trás.
    const conferir = async () => {
      if (!api || !ativo) return
      try {
        const [total, novas] = await Promise.all([api.contarNaoLidas(eu), api.notificacoesDesde(eu, desde)])
        if (!ativo) return
        chegaram(novas)
        setNaoLidas(total)
      } catch {
        /* sem rede: a próxima volta tenta de novo */
      }
    }

    const ligar = async () => {
      if (estado !== 'parado') return
      estado = 'ligando'
      try {
        api = await import('../data/api')
        const [total, recentes] = await Promise.all([api.contarNaoLidas(eu), api.listarNotificacoes(eu, 1)])
        if (!ativo) return
        setNaoLidas(total)
        // O que já existia antes de abrir não é novidade: só o que chegar daqui em diante.
        if (recentes[0]) {
          vistas.add(recentes[0].id)
          desde = recentes[0].created_at
        }
        estado = 'ligado'
      } catch {
        // Sem rede na abertura, ou a 0017 ainda não aplicada no banco: o sino fica em zero,
        // e a próxima volta ao app tenta ligar de novo.
        estado = 'parado'
        return
      }
      desligarCanal = api.ouvirNotificacoes(
        eu,
        n => {
          if (chegaram([n]).length && !n.lida_em) setNaoLidas(c => c + 1)
        },
        conectado => {
          // Voltou depois de cair com o app aberto (sinal fraco na obra): o que chegou
          // durante a queda não vem pelo tempo real.
          if (conectado && caiu) conferir()
          if (!conectado && aoVivo) caiu = true
          aoVivo = conectado
        },
      )
      relogio = setInterval(() => {
        if (!aoVivo && document.visibilityState === 'visible') conferir()
      }, INTERVALO_SEM_TEMPO_REAL)
    }

    const aoVoltar = () => {
      if (document.visibilityState !== 'visible') return
      if (estado === 'ligado') conferir()
      else ligar()
    }

    quandoOcioso(ligar)
    document.addEventListener('visibilitychange', aoVoltar)
    return () => {
      ativo = false
      desligarCanal()
      clearInterval(relogio)
      document.removeEventListener('visibilitychange', aoVoltar)
      recontarAgora.current = () => {}
    }
  }, [userId, avisar])

  // Aviso com o app fechado (lib/push.ts): no APK sempre; no navegador e no iPhone, só onde a
  // pessoa ligou o Web Push — e o código dele só baixa nesses casos. O toque no aviso abre a
  // tela certa e já conta como lido.
  useEffect(() => {
    if (!userId || !(ehNativo() || webPushLigado())) return
    let ativo = true
    let desligar = () => {}
    quandoOcioso(() => {
      import('./push')
        .then(m => {
          if (!ativo) return
          desligar = m.iniciarPush({
            navegar: caminho => navegar.current(caminho),
            aoLer: () => recontarAgora.current(),
          })
        })
        .catch(() => {})
    })
    return () => {
      ativo = false
      desligar()
    }
  }, [userId])

  // Toque no aviso do Web Push (public/push-sw.js). Com o app fechado, ele abre na tela do
  // aviso com ?aviso=<id> no endereço; com o app aberto, o service worker manda uma mensagem.
  // Nos dois casos: marca como lido e vai para a tela.
  useEffect(() => {
    if (!userId) return
    const abrir = (caminho: string, trocar: boolean) => {
      const url = new URL(caminho, window.location.origin)
      const id = url.searchParams.get('aviso')
      url.searchParams.delete('aviso')
      if (id) {
        import('../data/api')
          .then(m => m.marcarNotificacoesLidas([id]))
          .then(() => recontarAgora.current())
          .catch(() => {})
      }
      navegar.current(url.pathname + url.search, { replace: trocar })
    }
    if (new URLSearchParams(window.location.search).has('aviso')) {
      abrir(window.location.pathname + window.location.search, true)
    }
    const aoMensagem = (e: MessageEvent) => {
      const caminho = e.data?.caminho
      if (e.data?.tipo === 'abrir-aviso' && typeof caminho === 'string' && caminho.startsWith('/') && !caminho.startsWith('//')) {
        abrir(caminho, false)
      }
    }
    navigator.serviceWorker?.addEventListener('message', aoMensagem)
    return () => navigator.serviceWorker?.removeEventListener('message', aoMensagem)
  }, [userId])

  // O número também no ícone do app instalado pela tela de início (Android e computador).
  useEffect(() => {
    const nav = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>
      clearAppBadge?: () => Promise<void>
    }
    if (!nav.setAppBadge) return
    const pedido = naoLidas ? nav.setAppBadge(naoLidas) : nav.clearAppBadge?.()
    pedido?.catch(() => {})
  }, [naoLidas])

  const recontar = useCallback(() => recontarAgora.current(), [])
  const valor = useMemo<Contexto>(() => ({ naoLidas, recontar }), [naoLidas, recontar])

  return <NotificacoesContext.Provider value={valor}>{children}</NotificacoesContext.Provider>
}

// Web Push ligado neste aparelho (lib/webPush.ts)? Lido aqui, sem importar o módulo dele.
function webPushLigado(): boolean {
  try {
    return localStorage.getItem('alicerce:webpush') === 'ligado'
  } catch {
    return false
  }
}

export function useNotificacoes() {
  return useContext(NotificacoesContext)
}

// A tela diz o que fazer quando chega novidade da equipe — em geral, recarregar os números.
// Avisos que chegam juntos (a obra nova e a entrada dela) viram uma chamada só.
export function useNovidades(aoChegar: (novas: Notificacao[]) => void) {
  const atual = useRef(aoChegar)
  useEffect(() => {
    atual.current = aoChegar
  })

  useEffect(() => {
    let juntas: Notificacao[] = []
    let espera: ReturnType<typeof setTimeout> | undefined
    const ouvinte = (novas: Notificacao[]) => {
      juntas = juntas.concat(novas)
      clearTimeout(espera)
      espera = setTimeout(() => {
        const lote = juntas
        juntas = []
        atual.current(lote)
      }, 300)
    }
    ouvintes.add(ouvinte)
    return () => {
      clearTimeout(espera)
      ouvintes.delete(ouvinte)
    }
  }, [])
}
