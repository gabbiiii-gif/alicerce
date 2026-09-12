import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { AnimatePresence } from 'motion/react'
import { useAuth } from './lib/auth'
import { Carregando } from './components/Tela'
import { Login } from './screens/Login'
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

function Protegida({ children }: { children: ReactNode }) {
  const { session, carregando } = useAuth()
  const location = useLocation()
  if (carregando) return <Carregando />
  if (!session) return <Navigate to="/login" replace state={{ de: location.pathname }} />
  return <>{children}</>
}

export function App() {
  const location = useLocation()

  return (
    <div className="app">
      {/* Sem `mode`: as duas telas convivem por um instante. Como toda tela é
          `position: absolute`, a que entra desliza por cima da que sai, em vez de
          esperar a primeira terminar — que é o que deixaria a navegação arrastada. */}
      <AnimatePresence initial={false}>
        <Routes location={location} key={location.pathname}>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Protegida><Obras /></Protegida>} />
          <Route path="/nova" element={<Protegida><NovaObra /></Protegida>} />
          <Route path="/obra/:obraId" element={<Protegida><Painel /></Protegida>} />
          <Route path="/obra/:obraId/enviar" element={<Protegida><Enviar /></Protegida>} />
          <Route path="/obra/:obraId/revisar/:comprovanteId" element={<Protegida><Revisar /></Protegida>} />
          <Route path="/obra/:obraId/relatorios" element={<Protegida><Relatorios /></Protegida>} />
          <Route path="/obra/:obraId/categorias" element={<Protegida><Categorias /></Protegida>} />
          <Route path="/obra/:obraId/equipe" element={<Protegida><Equipe /></Protegida>} />
          <Route path="/obra/:obraId/encerrar" element={<Protegida><Encerrar /></Protegida>} />
          <Route path="/perfil" element={<Protegida><Perfil /></Protegida>} />
          <Route path="/e/:codigo" element={<Protegida><AceitarConvite /></Protegida>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AnimatePresence>
    </div>
  )
}
