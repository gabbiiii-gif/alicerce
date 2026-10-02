import { StrictMode, Suspense, lazy, startTransition, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { LazyMotion, MotionConfig } from 'motion/react'
import { AuthProvider } from './lib/auth'
import { PlanoProvider } from './lib/plano'
import { ToastProvider } from './components/Toast'
import { NotificacoesProvider } from './lib/notificacoes'
import { configurado } from './lib/sessao'
import { ehNativo } from './lib/plataforma'
import { revelar } from './lib/abertura'
import { quandoOcioso } from './lib/agenda'
import { Marca } from './components/Marca'
import { codigoParaEntregar } from './lib/ponte'
import { App } from './App'
import './index.css'

// Dentro do APK/IPA a barra de status é do sistema, não do navegador: pintamos ela
// com o navy do app para a tela não ficar com uma faixa branca em cima.
if (ehNativo()) {
  import('@capacitor/status-bar').then(({ StatusBar, Style }) => {
    StatusBar.setStyle({ style: Style.Light }).catch(() => {})
    StatusBar.setBackgroundColor({ color: '#0A2A6E' }).catch(() => {})
  })
}

// As telas vêm em arquivos separados. Se sair uma versão nova do app enquanto alguém está
// com ele aberto, os arquivos da versão antiga deixam de existir no servidor, e abrir uma
// tela que ainda não tinha sido carregada falha. Recarregar busca a versão nova inteira —
// uma vez só: se falhar de novo logo em seguida, não fica em laço. Sem internet não
// adianta recarregar (sairia do app para a página de erro do navegador): quem responde
// é o aviso de "Tentar de novo" da própria tela (App.tsx).
window.addEventListener('vite:preloadError', () => {
  if (!navigator.onLine) return
  try {
    const ultima = Number(sessionStorage.getItem('alicerce:recarregou') ?? 0)
    if (Date.now() - ultima < 10_000) return
    sessionStorage.setItem('alicerce:recarregou', String(Date.now()))
  } catch {
    /* sem sessionStorage: recarrega mesmo assim */
  }
  window.location.reload()
})

// iPhone: ao abrir o teclado o iOS rola a página para o campo aparecer, e às vezes não
// desfaz quando o teclado fecha — o app ficava deslocado para cima até ser reaberto. A
// página nunca precisa rolar (quem rola é cada tela), então, sem campo em foco, volta ao
// topo. Com zoom de pinça a pessoa está olhando um pedaço da tela de propósito: não mexe.
// A casca (main.app) também: o CSS a impede de rolar com `overflow: clip`, mas o Safari
// anterior ao iOS 16 não conhece o clip.
function desrolar() {
  const casca = document.querySelector<HTMLElement>('main.app')
  if (!window.scrollY && !window.scrollX && !casca?.scrollTop && !casca?.scrollLeft) return
  if ((window.visualViewport?.scale ?? 1) > 1.01) return
  const foco = document.activeElement
  if (foco instanceof HTMLElement && (foco.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(foco.tagName))) return
  window.scrollTo(0, 0)
  casca?.scrollTo(0, 0)
}
window.addEventListener('scroll', desrolar, { passive: true })
// O foco sai do campo antes de o teclado terminar de fechar; o resize do viewport marca o fim.
window.addEventListener('focusout', () => setTimeout(desrolar, 60))
window.visualViewport?.addEventListener('resize', desrolar)

// O service worker guarda o app no aparelho para abrir sem internet, e para isso baixa
// todos os arquivos de uma vez. Registrado junto com a primeira tela, essa descarga
// disputaria a rede com ela; vai depois que a página carregou e o celular está ocioso.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () =>
    quandoOcioso(() => navigator.serviceWorker.register('/sw.js').catch(() => {}), 4000),
  )
}

function FaltaConfigurar() {
  useEffect(revelar, [])
  return (
    <main className="app">
      <div className="scr">
        <div className="bd" style={{ justifyContent: 'center', gap: 14, padding: '20px 22px' }}>
          <div style={{ alignSelf: 'center' }}>
            <Marca />
          </div>
          <div style={{ textAlign: 'center', fontSize: 20, fontFamily: 'var(--fonte-titulo)' }}>
            Falta ligar o servidor
          </div>
          <div className="ann">
            Preencha <b>VITE_SUPABASE_URL</b> e <b>VITE_SUPABASE_ANON_KEY</b> no arquivo <b>.env</b> e rode{' '}
            <b>npm run dev</b> de novo. As duas saem do painel do Supabase, em Project Settings → API.
          </div>
        </div>
      </div>
    </main>
  )
}

// O Motion entra em duas partes: o mínimo para montar os componentes vai junto com a
// primeira tela, e os recursos de animação chegam logo em seguida, em arquivo separado.
// Era um terço do JavaScript da primeira tela. `strict` avisa, em desenvolvimento, se
// alguém usar o `motion.div` completo no lugar do `m.div`, que traria tudo de volta.
const recursosDeMovimento = () => import('./lib/movimento').then(r => r.default)

// Em transição, o React monta a primeira tela em fatias de poucos milissegundos, cedendo
// a vez ao navegador entre elas. De uma vez só, era uma tarefa longa que travava o
// celular simples bem na hora em que a abertura está animando — e em que a pessoa já
// pode tocar na tela.
// A janela do Google que o iPhone abre por cima do app da Tela de Início (lib/ponte.ts) não
// monta o app: só entrega o código e manda a pessoa de volta.
const entrega = configurado ? codigoParaEntregar() : null
// Só baixa nessa janela. Enquanto chega, a abertura continua cobrindo a tela.
const VoltaDoGoogle = lazy(() => import('./components/VoltaDoGoogle').then(m => ({ default: m.VoltaDoGoogle })))

const raiz = createRoot(document.getElementById('root')!)
startTransition(() => raiz.render(
  <StrictMode>
    {entrega ? (
      <Suspense fallback={null}>
        <VoltaDoGoogle ponte={entrega.ponte} codigo={entrega.codigo} />
      </Suspense>
    ) : configurado ? (
      // Uma linha e todo o Motion do app passa a obedecer "reduzir movimento" do sistema.
      <MotionConfig reducedMotion="user">
        <LazyMotion features={recursosDeMovimento} strict>
          <BrowserRouter>
            <AuthProvider>
              <PlanoProvider>
                <ToastProvider>
                  <NotificacoesProvider>
                    <App />
                  </NotificacoesProvider>
                </ToastProvider>
              </PlanoProvider>
            </AuthProvider>
          </BrowserRouter>
        </LazyMotion>
      </MotionConfig>
    ) : (
      <FaltaConfigurar />
    )}
  </StrictMode>,
))
