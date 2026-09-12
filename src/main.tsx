import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { MotionConfig } from 'motion/react'
import { AuthProvider } from './lib/auth'
import { ToastProvider } from './components/Toast'
import { configurado } from './lib/supabase'
import { ehNativo } from './lib/plataforma'
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

function FaltaConfigurar() {
  return (
    <div className="app">
      <div className="scr">
        <div className="bd" style={{ justifyContent: 'center', gap: 14, padding: '20px 22px' }}>
          <div style={{ alignSelf: 'center' }}>
            <Marca />
          </div>
          <div style={{ textAlign: 'center', fontSize: 20, fontFamily: "'Instrument Sans', sans-serif" }}>
            Falta ligar o servidor
          </div>
          <div className="ann">
            Preencha <b>VITE_SUPABASE_URL</b> e <b>VITE_SUPABASE_ANON_KEY</b> no arquivo <b>.env</b> e rode{' '}
            <b>npm run dev</b> de novo. As duas saem do painel do Supabase, em Project Settings → API.
          </div>
        </div>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {configurado ? (
      // Uma linha e todo o Motion do app passa a obedecer "reduzir movimento" do sistema.
      <MotionConfig reducedMotion="user">
        <BrowserRouter>
          <AuthProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </AuthProvider>
        </BrowserRouter>
      </MotionConfig>
    ) : (
      <FaltaConfigurar />
    )}
  </StrictMode>,
)
