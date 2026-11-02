import { useState } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { CURVA } from '../lib/animacao'
import { Marca } from '../components/Marca'

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
    //
    // Montando junto com o app, ela já nasce pronta (AnimatePresence initial={false} no
    // App.tsx): está atrás da abertura, e quem a apresenta é a saída da abertura. Na saída
    // dela, desliza para a esquerda e deixa à mostra a tela de entrada, já montada atrás.
    <m.div
      className="scr"
      style={{ zIndex: 20 }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, x: -16 }}
      transition={CURVA}
    >
      {/* Uma coluna branca de celular: no desktop ela fica no meio, sobre o fundo do app,
          em vez de esticar três frases curtas pela tela inteira. */}
      <div
        className="bd"
        style={{
          width: '100%',
          maxWidth: 440,
          margin: '0 auto',
          background: '#fff',
          gap: 0,
          padding: 'calc(28px + env(safe-area-inset-top)) 24px calc(24px + env(safe-area-inset-bottom))',
        }}
      >
        {/* A marca pequena no topo, sem nome: a pessoa acabou de ver o nome na abertura.
            O "pular" fica do lado, à mão desde o primeiro passo; no último, o botão de baixo
            já entra, e ele vira o atalho de quem já tem conta. */}
        <div className="row" style={{ flex: 'none' }}>
          <Marca largura={34} />
          <button className="bt-texto" onClick={terminar} style={{ fontSize: 14, padding: '8px 0 8px 12px' }}>
            {ultimo ? 'já tenho conta' : 'pular'}
          </button>
        </div>

        <div style={{ flex: '1 0 auto', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '24px 0' }}>
          {/* A troca anima só o conteúdo: a marca, os pontos e o botão ficam parados,
              então o que muda é o que a pessoa precisa reler. */}
          <AnimatePresence mode="wait" initial={false}>
            <m.div
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
                  color: 'var(--azul-700)',
                }}
              >
                {atual.kicker}
              </div>
              <h1
                style={{
                  margin: 0,
                  fontFamily: 'var(--fonte-titulo)',
                  fontSize: 30,
                  fontWeight: 500,
                  lineHeight: 1.12,
                  letterSpacing: '-.02em',
                  textWrap: 'pretty',
                }}
              >
                {atual.titulo}
              </h1>
              <p
                style={{
                  margin: 0,
                  fontSize: 14,
                  lineHeight: 1.5,
                  color: 'var(--texto-secundario)',
                  maxWidth: 280,
                  textWrap: 'pretty',
                }}
              >
                {atual.texto}
              </p>

              {passo === 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 8 }}>
                  <div className="bar">
                    {/* Desliza em vez de crescer: é transform, que a placa de vídeo move sem
                        recalcular layout, e a ponta redonda não deforma como na escala. */}
                    <m.div
                      initial={{ x: '-100%' }}
                      animate={{ x: 0 }}
                      transition={{ ...CURVA, duration: 0.5, delay: 0.15 }}
                      style={{ width: '62%', height: '100%', background: 'var(--azul)', borderRadius: 99 }}
                    />
                  </div>
                  <div className="row">
                    <span className="note">Entrada + parcelas</span>
                    <span className="note">Em aberto</span>
                  </div>
                </div>
              )}

              {passo === 1 && (
                <div className="cd" style={{ marginTop: 6, padding: '14px 16px', gap: 10 }}>
                  <div className="row">
                    <span style={{ fontSize: 14 }}>Depósito Areia Boa</span>
                    <span className="num" style={{ fontSize: 15, fontWeight: 500 }}>R$ 1.240</span>
                  </div>
                  <div className="row">
                    {/* Só o desenho do chip: aqui ele não é botão, então sem a mãozinha. */}
                    <span className="chip" style={{ cursor: 'default' }}>Material</span>
                    <span style={{ fontSize: 12.5, color: 'var(--azul-700)' }}>Lido da nota</span>
                  </div>
                </div>
              )}

              {passo === 2 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 6 }}>
                  <span className="av" style={{ width: 36, height: 36 }}>JP</span>
                  {/* Sobreposto ao primeiro, com o aro branco separando os dois: um histórico só. */}
                  <span className="av socio" style={{ width: 36, height: 36, marginLeft: -18, border: '2px solid #fff' }}>
                    MR
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--texto-secundario)' }}>Um histórico, dois nomes</span>
                </div>
              )}
            </m.div>
          </AnimatePresence>
        </div>

        <div style={{ display: 'flex', gap: 6, paddingBottom: 18, flex: 'none' }} aria-hidden="true">
          {PASSOS.map((_, i) => (
            <m.i
              key={i}
              animate={{ width: passo === i ? 20 : 6 }}
              transition={{ duration: 0.2 }}
              style={{
                height: 6,
                borderRadius: 99,
                background: passo === i ? 'var(--azul)' : 'var(--linha-forte)',
                display: 'block',
              }}
            />
          ))}
        </div>
        {/* Os pontos são só desenho; o leitor de tela ouve em que passo está. */}
        <span className="so-leitor" aria-live="polite">
          Passo {passo + 1} de {PASSOS.length}
        </span>

        <button className="bt btp" onClick={() => (ultimo ? terminar() : setPasso(passo + 1))}>
          {ultimo ? 'Entrar' : 'Continuar'}
        </button>
      </div>
    </m.div>
  )
}
