import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useState, type ReactNode } from 'react'
import { AnimatePresence } from 'motion/react'
import { useAuth } from './lib/auth'
import { guardarDestino, lerDestino, limparDestino } from './lib/destino'
import { Abertura } from './components/Abertura'
import { Intro, introJaVista } from './screens/Intro'
import { Carregando } from './components/Tela'
import { Login } from './screens/Login'
import { Resumo } from './screens/Resumo'
import { Obras } from './screens/Obras'
import { NovaObra } from './screens/NovaObra'
import { Painel } from './screens/Painel'
import { Enviar } from './screens/Enviar'
import { Revisar } from './screens/Revisar'
import { Relatorios } from './screens/Relatorios'
import { Perfil } from './screens/Perfil'
import { Categorias } from './screens/Categorias'
import { Equipe } from './screens/Equipe'
import { Encerrar } from './screens/Encerrar'
import { AceitarConvite } from './screens/AceitarConvite'

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
  const [abrindo, setAbrindo] = useState(true)
  const [introPendente, setIntroPendente] = useState(() => !introJaVista())

  // A intro é para quem chega pela primeira vez. Quem já tem sessão conhece o app —
  // trocou de aparelho, reinstalou, limpou o navegador — e não precisa da apresentação.
  const mostraIntro = introPendente && !abrindo && !carregando && !session

  return (
    <div className="app">
      {/* A abertura fica POR CIMA, não no lugar: as rotas montam atrás enquanto ela
          roda, então quando o navy sai a tela de trás já está pronta. Substituir faria a
          espera da animação somar com a espera do carregamento. */}
      {abrindo && <Abertura aoTerminar={() => setAbrindo(false)} />}
      {mostraIntro && <Intro aoTerminar={() => setIntroPendente(false)} />}
      <RetomaDestino />
      {/* Sem `mode`: as duas telas convivem por um instante. Como toda tela é
          `position: absolute`, a que entra desliza por cima da que sai, em vez de
          esperar a primeira terminar — que é o que deixaria a navegação arrastada. */}
      <AnimatePresence initial={false}>
        <Routes location={location} key={location.pathname}>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Protegida><Resumo /></Protegida>} />
          <Route path="/obras" element={<Protegida><Obras /></Protegida>} />
          {/* Endereço antigo do resumo: quem tiver um link guardado continua chegando. */}
          <Route path="/resumo" element={<Navigate to="/" replace />} />
          <Route path="/nova" element={<Protegida><NovaObra /></Protegida>} />
          <Route path="/obra/:obraId" element={<Protegida><Painel /></Protegida>} />
          <Route path="/obra/:obraId/enviar" element={<Protegida><Enviar /></Protegida>} />
          <Route path="/obra/:obraId/revisar/:comprovanteId" element={<Protegida><Revisar /></Protegida>} />
          <Route path="/obra/:obraId/relatorios" element={<Protegida><Relatorios /></Protegida>} />
          <Route path="/obra/:obraId/categorias" element={<Protegida><Categorias /></Protegida>} />
          <Route path="/obra/:obraId/equipe" element={<Protegida><Equipe /></Protegida>} />
          <Route path="/obra/:obraId/encerrar" element={<Protegida><Encerrar /></Protegida>} />
          <Route path="/relatorios" element={<Protegida><Relatorios /></Protegida>} />
          <Route path="/perfil" element={<Protegida><Perfil /></Protegida>} />
          <Route path="/e/:codigo" element={<Protegida><AceitarConvite /></Protegida>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AnimatePresence>
    </div>
  )
}
