import { lazy, Suspense, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { lerDestino } from '../lib/destino'
import { useAviso } from '../components/Toast'
import { Marca } from '../components/Marca'
import { Carregando } from '../components/Tela'
import { motion } from 'motion/react'
import { CURVA, TELA } from '../lib/animacao'

import { NomeAnimado } from '../components/NomeAnimado'

// Sob demanda: o Three.js só viaja para quem chega na tela de entrada.
const MarcaTres = lazy(() => import('../components/MarcaTres'))

export function Login() {
  const { session, carregando, entrarComGoogle } = useAuth()
  const avisar = useAviso()
  const location = useLocation()
  const [comGoogle, setComGoogle] = useState(false)

  if (carregando) return <Carregando />
  if (session) {
    // Havendo destino guardado, quem navega é o RetomaDestino (App.tsx) — e só ele.
    // Os dois <Navigate> disparavam no mesmo ciclo e o segundo vencia: o RetomaDestino
    // mandava para /e/CODIGO e este, que só conhece o state do router (vazio depois de um
    // redirect de página inteira), mandava para "/" em seguida. Era o que despejava quem
    // abria um convite na lista de obras.
    if (lerDestino()) return <Carregando />
    // Via rápida de quem já estava dentro do app: o state do router não passa por storage.
    return <Navigate to={(location.state as { de?: string })?.de || '/'} replace />
  }

  async function google() {
    setComGoogle(true)
    try {
      await entrarComGoogle()
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'não deu para entrar com o Google')
      setComGoogle(false)
    }
    // Deu certo: a página sai para o Google, então não desligamos o "aguarde".
  }

  return (
    <motion.div className="scr" variants={TELA} initial="entra" animate="parada" exit="sai" transition={CURVA}>
      <div className="bd" style={{ justifyContent: 'center', gap: 14, padding: '20px 22px' }}>
        <div style={{ alignSelf: 'center', padding: '8px 0 4px' }}>
          {/* Enquanto o Three.js baixa, a marca chapada já está na tela — e é ela que
              fica para sempre em quem não tem WebGL. Nunca há um buraco aqui. */}
          <Suspense fallback={<Marca />}>
            <MarcaTres />
          </Suspense>
        </div>
        <div style={{ textAlign: 'center' }}>
          <NomeAnimado texto="Alicerce" className="nome-marca" />
        </div>
        <div className="note" style={{ textAlign: 'center', marginBottom: 6 }}>obras e gastos no lugar certo</div>

        {/* Uma porta só. Entrar com Google não pede senha nova para decorar, já traz nome
            e foto, e tira do app a responsabilidade de guardar senha de alguém. */}
        <button className="bt bt-google" onClick={google} disabled={comGoogle}>
          <LogoGoogle />
          {comGoogle ? 'abrindo o Google…' : 'Continuar com Google'}
        </button>

      </div>
    </motion.div>
  )
}

// Logo oficial do Google — as quatro cores são exigência da marca, não escolha nossa.
function LogoGoogle() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24s.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}
