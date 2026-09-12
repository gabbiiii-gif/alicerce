import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CURVA } from '../lib/animacao'

const CHAVE = 'alicerce:intro-vista'

export function introJaVista(): boolean {
  try {
    return localStorage.getItem(CHAVE) === '1'
  } catch {
    // Modo privado: sem onde lembrar, a intro volta a aparecer. Melhor repetir a
    // apresentação do que travar a entrada de quem bloqueia armazenamento.
    return false
  }
}

function marcarVista() {
  try {
    localStorage.setItem(CHAVE, '1')
  } catch {
    /* segue sem lembrar */
  }
}

// Três telas antes do primeiro login, explicando o que o app faz. Cada uma leva junto um
// pedaço da interface de verdade — a barra do saldo, a nota lida, os dois nomes no
// histórico —, porque mostrar a coisa convence mais do que descrevê-la.
const PASSOS = [
  {
    kicker: 'CADA OBRA',
    titulo: 'Valor fechado, entrada, saldo em aberto',
    texto:
      'A obra só começa depois da entrada. O resto fica em aberto e vai baixando a cada parcela recebida; aditivos somam por fora.',
  },
  {
    kicker: 'COMPROVANTES',
    titulo: 'Manda a nota, o agente lança',
    // O design dizia "ou encaminhado no WhatsApp", que ainda não existe. Intro que
    // promete o que o app não faz vira a primeira frustração de quem acabou de entrar.
    texto: 'Foto da nota ou PDF. Ele lê valor, data e fornecedor; você só confere.',
  },
  {
    kicker: 'A DOIS',
    titulo: 'Histórico compartilhado, contas separadas',
    texto:
      'Cada lançamento mostra quem enviou. No fim da semana e do mês o relatório soma os dois, nota a nota.',
  },
]

export function Intro({ aoTerminar }: { aoTerminar: () => void }) {
  const [passo, setPasso] = useState(0)
  const atual = PASSOS[passo]
  const ultimo = passo === PASSOS.length - 1

  function terminar() {
    marcarVista()
    aoTerminar()
  }

  return (
    // zIndex acima das rotas: .scr é absolute sem camada própria, e a tela de login
    // desenharia por cima desta — a intro existia, montava e ficava escondida atrás.
    // Abaixo de 50, que é da abertura: ela entra antes e sai por cima.
    <motion.div
      className="scr"
      style={{ zIndex: 20 }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={CURVA}
    >
      <div className="bd" style={{ padding: '26px 24px 22px', gap: 0 }}>
        {/* A marca pequena no topo, sem nome: a pessoa acabou de ver o nome na abertura. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 'none' }}>
          <i style={{ width: 16, height: 3.5, background: '#6CB4F0', display: 'block' }} />
          <i style={{ width: 23, height: 3.5, background: '#1B8FE8', display: 'block' }} />
          <i style={{ width: 20, height: 3.5, background: '#0A2A6E', display: 'block' }} />
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 16 }}>
          {/* A troca anima só o conteúdo: a marca, os pontos e o botão ficam parados,
              então o que muda é o que a pessoa precisa reler. */}
          <AnimatePresence mode="wait">
            <motion.div
              key={passo}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ ...CURVA, duration: 0.22 }}
              style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
            >
              <div
                style={{
                  fontFamily: 'var(--fonte-titulo)',
                  fontSize: 11,
                  fontWeight: 500,
                  letterSpacing: '.16em',
                  color: '#2272CC',
                }}
              >
                {atual.kicker}
              </div>
              <div
                style={{
                  fontFamily: 'var(--fonte-titulo)',
                  fontSize: 27,
                  fontWeight: 500,
                  lineHeight: 1.15,
                  letterSpacing: '-.02em',
                }}
              >
                {atual.titulo}
              </div>
              <div className="note" style={{ maxWidth: 250, lineHeight: 1.5 }}>{atual.texto}</div>

              {passo === 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7, paddingTop: 6 }}>
                  <div style={{ height: 8, borderRadius: 99, background: '#E4EDF8', overflow: 'hidden', display: 'flex' }}>
                    <motion.div
                      initial={{ flex: 0 }}
                      animate={{ flex: 62 }}
                      transition={{ ...CURVA, delay: 0.15 }}
                      style={{ background: '#1B8FE8' }}
                    />
                    <div style={{ flex: 38 }} />
                  </div>
                  <div className="row">
                    <span className="note">entrada + parcelas</span>
                    <span className="note">em aberto</span>
                  </div>
                </div>
              )}

              {passo === 1 && (
                <div className="cd" style={{ marginTop: 6 }}>
                  <div className="row">
                    <span className="note">Depósito Areia Boa</span>
                    <b className="num" style={{ fontSize: 14 }}>R$ 1.240</b>
                  </div>
                  <div className="row">
                    <span className="chip">material</span>
                    <span className="note">lido da nota</span>
                  </div>
                </div>
              )}

              {passo === 2 && (
                <div className="row" style={{ justifyContent: 'flex-start', gap: 8, paddingTop: 6 }}>
                  <div className="av">JP</div>
                  <div className="av">MR</div>
                  <span className="note">um histórico, dois nomes</span>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="row" style={{ gap: 5, justifyContent: 'flex-start', paddingBottom: 16, flex: 'none' }}>
          {PASSOS.map((_, i) => (
            <motion.i
              key={i}
              animate={{ width: passo === i ? 18 : 6 }}
              transition={{ duration: 0.2 }}
              style={{ height: 6, borderRadius: 99, background: passo === i ? '#1B8FE8' : '#D5E2F2', display: 'block' }}
            />
          ))}
        </div>

        <button className="bt btp" onClick={() => (ultimo ? terminar() : setPasso(passo + 1))}>
          {ultimo ? 'Entrar' : 'Continuar'}
        </button>
        <button
          className="note"
          onClick={terminar}
          style={{ background: 'none', border: 'none', textAlign: 'center', paddingTop: 10, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          {ultimo ? 'já tenho conta' : 'pular'}
        </button>
      </div>
    </motion.div>
  )
}
