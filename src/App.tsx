import { matchPath, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Component, lazy, Suspense, useEffect, useState, type ComponentType, type ReactNode } from 'react'
import { AnimatePresence } from 'motion/react'
import { useAuth } from './lib/auth'
import { guardarDestino, lerDestino, limparDestino } from './lib/destino'
import { revelar } from './lib/abertura'
import { quandoOcioso } from './lib/agenda'
import { talvezTenhaSessao } from './lib/sessao'
import { Intro, introJaVista } from './screens/Intro'
import { Carregando, TelaCarregando } from './components/Tela'
import { Login } from './screens/Login'

// Cada tela é um arquivo à parte, baixado quando é preciso.
//
// Antes todas vinham num pacote só, e quem abria o app pela primeira vez baixava o painel,
// os relatórios e o gerador de PDF para ver uma tela de entrada. Agora a primeira tela
// leva só o que ela usa; o resto chega depois, no tempo livre do celular.
function sobDemanda<M>(carregar: () => Promise<M>, nome: keyof M) {
  return {
    carregar,
    Tela: lazy(() => carregar().then(m => ({ default: m[nome] as ComponentType }))),
  }
}

const Resumo = sobDemanda(() => import('./screens/Resumo'), 'Resumo')
const Obras = sobDemanda(() => import('./screens/Obras'), 'Obras')
const NovaObra = sobDemanda(() => import('./screens/NovaObra'), 'NovaObra')
const Painel = sobDemanda(() => import('./screens/Painel'), 'Painel')
const Enviar = sobDemanda(() => import('./screens/Enviar'), 'Enviar')
const Revisar = sobDemanda(() => import('./screens/Revisar'), 'Revisar')
const Lancar = sobDemanda(() => import('./screens/Lancar'), 'Lancar')
const Relatorios = sobDemanda(() => import('./screens/Relatorios'), 'Relatorios')
const Perfil = sobDemanda(() => import('./screens/Perfil'), 'Perfil')
const Plano = sobDemanda(() => import('./screens/Plano'), 'Plano')
const Notas = sobDemanda(() => import('./screens/Notas'), 'Notas')
const Categorias = sobDemanda(() => import('./screens/Categorias'), 'Categorias')
const Equipe = sobDemanda(() => import('./screens/Equipe'), 'Equipe')
const Encerrar = sobDemanda(() => import('./screens/Encerrar'), 'Encerrar')
const AceitarConvite = sobDemanda(() => import('./screens/AceitarConvite'), 'AceitarConvite')

// As rotas que pedem login, numa tabela só: é dela que saem as <Route> e também o
// "adiantar" da tela certa quando o app abre.
const PROTEGIDAS: Array<[string, ReturnType<typeof sobDemanda>]> = [
  ['/', Resumo],
  ['/obras', Obras],
  ['/nova', NovaObra],
  ['/obra/:obraId', Painel],
  ['/obra/:obraId/enviar', Enviar],
  ['/obra/:obraId/revisar/:comprovanteId', Revisar],
  ['/obra/:obraId/lancar', Lancar],
  ['/obra/:obraId/relatorios', Relatorios],
  ['/obra/:obraId/categorias', Categorias],
  ['/obra/:obraId/equipe', Equipe],
  ['/obra/:obraId/encerrar', Encerrar],
  ['/obra/:obraId/notas', Notas],
  ['/relatorios', Relatorios],
  ['/perfil', Perfil],
  ['/plano', Plano],
  ['/e/:codigo', AceitarConvite],
]

// Quem já tem sessão vai direto para uma tela protegida. O arquivo dela começa a baixar
// agora, junto com o Supabase, em vez de esperar a sessão ser confirmada para só então
// ser pedido — seriam duas esperas em fila.
if (talvezTenhaSessao()) {
  const caminho = window.location.pathname
  // Na volta do Google a URL é /login, mas o destino é o resumo.
  const rota = caminho === '/login' ? Resumo : PROTEGIDAS.find(([padrao]) => matchPath(padrao, caminho))?.[1]
  rota?.carregar().catch(() => {})
}

// Com a sessão aberta, as telas que faltam vêm para a memória uma por vez, quando o
// celular estiver livre. Tocar numa aba depois disso nunca espera download — e uma tela
// já carregada não quebra se sair uma versão nova do app no meio do uso.
let precarregou = false
function precarregarTelas() {
  if (precarregou) return
  precarregou = true
  const fila = PROTEGIDAS.map(([, rota]) => rota.carregar)
  const proxima = () => {
    const carregar = fila.shift()
    if (carregar) carregar().catch(() => {}).finally(() => quandoOcioso(proxima))
  }
  quandoOcioso(proxima)
}

// Libera a abertura (lib/abertura.ts). Fica dentro do mesmo <Suspense> da tela: enquanto
// o arquivo dela baixa, nada aqui monta, e a abertura continua cobrindo a espera.
function Pronta() {
  useEffect(revelar, [])
  return null
}

// Uma tela que não baixou (sem sinal, versão nova no ar) não pode derrubar o app inteiro
// numa página branca: vira um aviso com o que fazer.
class Falhou extends Component<{ children: ReactNode }, { falhou: boolean }> {
  state = { falhou: false }

  static getDerivedStateFromError() {
    return { falhou: true }
  }

  componentDidCatch() {
    revelar()
  }

  render() {
    if (!this.state.falhou) return this.props.children
    return (
      <div className="scr">
        <div className="bd" style={{ justifyContent: 'center', gap: 12, padding: '20px 22px' }}>
          <div className="ann">Não deu para abrir esta tela. Confira a conexão e tente de novo.</div>
          <button className="bt btp" onClick={() => window.location.reload()}>
            Tentar de novo
          </button>
        </div>
      </div>
    )
  }
}

function Carregavel({ children }: { children: ReactNode }) {
  return (
    <Falhou>
      <Suspense fallback={<TelaCarregando />}>
        {children}
        <Pronta />
      </Suspense>
    </Falhou>
  )
}

// Retoma o destino guardado assim que existe sessão, esteja a pessoa em que rota estiver.
//
// Não basta fazer isso na tela de Login: o `redirectTo` pede /login, mas quando essa URL
// não está na lista de Redirect URLs do Supabase ele devolve a pessoa no Site URL — ou
// seja, em "/". A tela de Login nunca monta, e um convite aberto por quem ainda não tinha
// conta terminava na lista de obras, com o código intacto no armazenamento e ninguém para
// lê-lo. Aqui vale para qualquer rota de volta.
function RetomaDestino() {
  const { session, carregando } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    if (carregando || !session) return
    const destino = lerDestino()
    if (!destino || destino === location.pathname) return
    limparDestino()
    navigate(destino, { replace: true })
  }, [session, carregando, location.pathname, navigate])

  return null
}

function Protegida({ children }: { children: ReactNode }) {
  const { session, carregando } = useAuth()
  const location = useLocation()
  if (carregando) return <Carregando />
  if (!session) {
    // Escrito aqui, e nao num efeito: o <Navigate> abaixo desmonta esta tela no mesmo
    // ciclo, e um efeito poderia nao chegar a rodar. A escrita e idempotente.
    guardarDestino(location.pathname)
    return <Navigate to="/login" replace state={{ de: location.pathname }} />
  }
  return <>{children}</>
}

export function App() {
  const location = useLocation()
  const { session, carregando } = useAuth()
  const [introPendente, setIntroPendente] = useState(() => !introJaVista())

  // A intro é para quem chega pela primeira vez. Quem já tem sessão conhece o app —
  // trocou de aparelho, reinstalou, limpou o navegador — e não precisa da apresentação.
  // Ela monta já atrás da abertura, e é a saída da abertura que a revela.
  const mostraIntro = introPendente && !carregando && !session

  useEffect(() => {
    if (session) precarregarTelas()
  }, [session])

  return (
    // <main>: o marco "conteúdo principal" que o leitor de tela usa para pular direto
    // para a tela, passando por cima do que é navegação.
    <main className="app">
      <AnimatePresence initial={false}>
        {mostraIntro && <Intro key="intro" aoTerminar={() => setIntroPendente(false)} />}
      </AnimatePresence>
      <RetomaDestino />
      {/* Sem `mode`: as duas telas convivem por um instante. Como toda tela é
          `position: absolute`, a que entra desliza por cima da que sai, em vez de
          esperar a primeira terminar — que é o que deixaria a navegação arrastada. */}
      <AnimatePresence initial={false}>
        <Routes location={location} key={location.pathname}>
          <Route path="/login" element={<Carregavel><Login /></Carregavel>} />
          {PROTEGIDAS.map(([caminho, { Tela }]) => (
            <Route
              key={caminho}
              path={caminho}
              element={
                <Protegida>
                  <Carregavel>
                    <Tela />
                  </Carregavel>
                </Protegida>
              }
            />
          ))}
          {/* Endereço antigo do resumo: quem tiver um link guardado continua chegando. */}
          <Route path="/resumo" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AnimatePresence>
    </main>
  )
}
