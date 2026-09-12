import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { CURVA, TELA } from '../lib/animacao'

type Props = {
  titulo: ReactNode
  voltar?: string | (() => void)
  acao?: ReactNode
  comAbas?: boolean
  children: ReactNode
}

export function Tela({ titulo, voltar, acao, comAbas, children }: Props) {
  const navigate = useNavigate()
  const aoVoltar = typeof voltar === 'function' ? voltar : voltar ? () => navigate(voltar) : undefined

  return (
    // A saída é o ganho aqui: o CSS animava só a entrada, porque na hora de desmontar
    // o elemento já não está no DOM para nenhum @keyframes rodar.
    <motion.div
      className="scr"
      variants={TELA}
      initial="entra"
      animate="parada"
      exit="sai"
      transition={CURVA}
    >
      <div className="nav">
        {aoVoltar && (
          <button className="voltar" onClick={aoVoltar} aria-label="Voltar">
            ‹
          </button>
        )}
        <b>{titulo}</b>
        {acao && <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>{acao}</div>}
      </div>
      <div className={comAbas ? 'bd com-abas' : 'bd'}>{children}</div>
    </motion.div>
  )
}

export function Carregando() {
  return (
    <div className="centro">
      <div className="carregando" />
    </div>
  )
}

export function Vazio({ children }: { children: ReactNode }) {
  return <div className="dsh" style={{ padding: '26px 14px' }}>{children}</div>
}
