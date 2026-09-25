import { StrictMode, startTransition, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { LazyMotion, MotionConfig } from 'motion/react'
import { AuthProvider } from './lib/auth'
import { PlanoProvider } from './lib/plano'
import { ToastProvider } from './components/Toast'
import { configurado } from './lib/sessao'
import { ehNativo } from './lib/plataforma'
import { revelar } from './lib/abertura'
import { quandoOcioso } from './lib/agenda'
import { Marca } from './components/Marca'
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
const raiz = createRoot(document.getElementById('root')!)
startTransition(() => raiz.render(
  <StrictMode>
    {configurado ? (
      // Uma linha e todo o Motion do app passa a obedecer "reduzir movimento" do sistema.
      <MotionConfig reducedMotion="user">
        <LazyMotion features={recursosDeMovimento} strict>
          <BrowserRouter>
            <AuthProvider>
              <PlanoProvider>
                <ToastProvider>
                  <App />
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
