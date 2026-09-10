import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

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
    <div className="scr">
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
    </div>
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
