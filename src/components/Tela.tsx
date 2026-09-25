import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { m } from 'motion/react'
import { CURVA, TELA } from '../lib/animacao'
import { aberturaSaiu } from '../lib/abertura'

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
    <m.div
      className="scr"
      variants={TELA}
      initial={aberturaSaiu() ? 'entra' : false}
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
    </m.div>
  )
}

export function Carregando() {
  return (
    <div className="centro" role="status">
      <div className="carregando" />
      <span className="so-leitor">Carregando…</span>
    </div>
  )
}

// O lugar de uma tela enquanto ela chega. Tem o formato de uma tela de verdade — barra de
// título e cartões —, então a troca para o conteúdo não parece um salto.
export function TelaCarregando() {
  return (
    <div className="scr" role="status">
      <div className="nav">
        <i className="esq" style={{ width: 128, height: 19, borderRadius: 6 }} />
      </div>
      <div className="bd">
        <i className="esq" style={{ height: 92 }} />
        <i className="esq" style={{ height: 64 }} />
        <i className="esq" style={{ height: 64 }} />
      </div>
      <span className="so-leitor">Carregando…</span>
    </div>
  )
}

export function Vazio({ children }: { children: ReactNode }) {
  return <div className="dsh" style={{ padding: '26px 14px' }}>{children}</div>
}
