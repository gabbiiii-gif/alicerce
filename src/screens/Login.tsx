import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { m, useReducedMotion, type Variants } from 'motion/react'
import { useAuth } from '../lib/auth'
import { lerDestino } from '../lib/destino'
import { useAviso } from '../components/Toast'
import { Carregando } from '../components/Tela'
import { CURVA, TELA } from '../lib/animacao'
import { aberturaSaiu } from '../lib/abertura'
import { Marca } from '../components/Marca'
import { NomeAnimado } from '../components/NomeAnimado'

export function Login() {
  const { session, carregando, entrarComGoogle, aguardandoGoogle } = useAuth()
  const avisar = useAviso()
  const location = useLocation()
  const [comGoogle, setComGoogle] = useState(false)

  // No iPhone, o app continua aqui enquanto o Google está aberto por cima. Na volta, o botão
  // destrava: se a pessoa fechou o Google sem escolher a conta, ela tenta de novo.
  useEffect(() => {
    const aoVoltar = () => document.visibilityState === 'visible' && setComGoogle(false)
    document.addEventListener('visibilitychange', aoVoltar)
    return () => document.removeEventListener('visibilitychange', aoVoltar)
  }, [])

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
    <m.div className="scr" variants={TELA} initial={aberturaSaiu() ? 'entra' : false} animate="parada" exit="sai" transition={CURVA}>
      {/* Uma coluna de celular, branca: no desktop ela fica no meio, sobre o fundo do app. */}
      <div className="bd" style={{ width: '100%', maxWidth: 440, margin: '0 auto', padding: 0, gap: 0, background: '#fff' }}>
        {/* O bloco navy continua a abertura, que é navy também: quando ela sai, a marca e o
            nome seguem no mesmo fundo, só que agora com o botão embaixo. Ele sobe por baixo
            da barra de status, que no app instalado é pintada do mesmo navy (main.tsx). */}
        <div
          style={{
            background: 'var(--navy)',
            padding: 'calc(76px + env(safe-area-inset-top)) 28px 56px',
            borderRadius: '0 0 36px 36px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 26,
            flex: 'none',
          }}
        >
          <MarcaQueSeMonta />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <NomeAnimado
              texto="alicerce"
              className="nome-marca"
              style={{ fontSize: 42, letterSpacing: '-.03em', color: '#fff' }}
            />
            {/* Azul claro sobre o navy: 7,7:1, folgado para texto pequeno. */}
            <div style={{ fontSize: 14, color: '#9FC4F0' }}>obras e gastos no lugar certo</div>
          </div>
        </div>

        <div
          style={{
            flex: '1 0 auto',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: 14,
            padding: '36px 24px calc(40px + env(safe-area-inset-bottom))',
          }}
        >
          {/* Uma porta só. Entrar com Google não pede senha nova para decorar, já traz nome
              e foto, e tira do app a responsabilidade de guardar senha de alguém. */}
          <button
            className="bt bt-google"
            onClick={google}
            disabled={comGoogle}
            style={{ minHeight: 52, borderRadius: 14, fontSize: 16, gap: 12, padding: '0 16px' }}
          >
            <LogoGoogle />
            {comGoogle ? 'abrindo o Google…' : 'Continuar com Google'}
          </button>

          {/* Enquanto o Google está aberto por cima (iPhone), a explicação da porta única dá
              lugar ao que a pessoa precisa fazer agora. */}
          {aguardandoGoogle ? (
            <div className="ann" role="status">
              Escolha a conta no Google e toque em <b>OK</b>, no canto de cima daquela janela, para voltar. O
              login termina sozinho aqui.
            </div>
          ) : (
            <p
              style={{
                margin: 0,
                fontSize: 13,
                lineHeight: 1.45,
                color: 'var(--texto-secundario)',
                textAlign: 'center',
                textWrap: 'pretty',
              }}
            >
              Uma porta só: sem senha nova para decorar, e sua conta já traz nome e foto.
            </p>
          )}
        </div>
      </div>
    </m.div>
  )
}

// A abertura avisa que saiu pondo `revelado` no <html> (lib/abertura.ts). O CSS do nome
// escuta a classe sozinho; a marca, que anima pelo Motion, precisa disso em estado.
function useRevelado() {
  const [revelado, setRevelado] = useState(aberturaSaiu)
  useEffect(() => {
    if (revelado) return
    const conferir = () => aberturaSaiu() && setRevelado(true)
    const observador = new MutationObserver(conferir)
    observador.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    // A classe pode ter chegado entre a montagem e este efeito.
    conferir()
    return () => observador.disconnect()
  }, [revelado])
  return revelado
}

// A marca se monta como na abertura (index.html), com os mesmos tempos e a mesma curva:
// o pórtico se desenha e a laje sobe. Lê como a abertura terminando de assentar, e não
// como uma segunda animação.
//
// "montada" usa quadros-chave, partindo do zero, e o estado de antes ("pronta") é a marca
// inteira. Assim ela aparece mesmo que os recursos de animação (lib/movimento.ts) ainda não
// tenham chegado, ou não cheguem: sem eles, fica parada e completa, em vez de sumida.
const CURVA_ABERTURA = [0.22, 0.8, 0.3, 1] as const

const PORTICO: Variants = {
  escondida: { pathLength: 0, opacity: 0 },
  pronta: { pathLength: 1, opacity: 1 },
  montada: {
    pathLength: [0, 1],
    // Com ponta redonda, um traço de comprimento zero ainda pinta um ponto em cada ponta
    // do caminho: a opacidade esconde esse primeiro quadro.
    opacity: [0, 1],
    transition: { pathLength: { duration: 0.55, ease: CURVA_ABERTURA }, opacity: { duration: 0.08 } },
  },
}

const LAJE: Variants = {
  escondida: { y: 8, opacity: 0 },
  pronta: { y: 0, opacity: 1 },
  // O atraso vai dentro dos quadros (o trecho parado no começo), e não em `delay`: com
  // delay, a laje ficaria inteira à vista até a animação começar, e então sumiria.
  montada: {
    y: [8, 8, 0],
    opacity: [0, 0, 1],
    transition: { duration: 0.68, times: [0, 0.26, 1], ease: ['linear', CURVA_ABERTURA] },
  },
}

function MarcaQueSeMonta() {
  const reduzir = useReducedMotion()
  const revelado = useRevelado()

  if (reduzir) return <Marca variante="escura" largura={96} />

  // Montando depois da abertura (saiu do app e voltou para cá), a animação roda na
  // entrada; montando atrás dela, espera a saída para começar à vista.
  const estado = {
    initial: aberturaSaiu() ? 'escondida' : false,
    animate: revelado ? 'montada' : 'pronta',
  } as const

  // Mesmo desenho do Marca.tsx, versão escura. `overflow: visible` deixa a laje subir de
  // baixo da caixa, como na abertura, em vez de ser cortada.
  return (
    <svg className="marca" width={96} height={85} viewBox="0 0 72 64" fill="none" aria-hidden="true" style={{ overflow: 'visible' }}>
      <m.path
        d="M10 40 L36 8 L62 40"
        stroke="#FFFFFF"
        strokeWidth="12"
        strokeLinecap="round"
        strokeLinejoin="round"
        variants={PORTICO}
        {...estado}
      />
      <m.rect x="4" y="52" width="64" height="12" rx="4" fill="#1B8FE8" variants={LAJE} {...estado} />
    </svg>
  )
}

// Logo oficial do Google — as quatro cores são exigência da marca, não escolha nossa.
function LogoGoogle() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" style={{ width: 20, height: 20 }}>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24s.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}
