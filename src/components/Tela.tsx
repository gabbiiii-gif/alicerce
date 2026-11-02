import type { CSSProperties, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { m } from 'motion/react'
import { CURVA, TELA } from '../lib/animacao'
import { aberturaSaiu } from '../lib/abertura'
import { useUsuario } from '../lib/auth'
import { Marca } from './Marca'
import { Sino } from './Sino'

// Até onde o miolo da tela se abre no desktop. Painéis com duas colunas usam a larga;
// formulários e listas simples ficam na estreita, que lê melhor numa coluna só.
const LARGURAS = { larga: 1040, media: 760, estreita: 640 }

type Props = {
  titulo: ReactNode
  voltar?: string | (() => void)
  acao?: ReactNode
  // A marca antes do título, nas telas de entrada de cada seção (Resumo, Obras).
  marca?: boolean
  // Sino e avatar no canto do cabeçalho.
  contas?: boolean
  largura?: keyof typeof LARGURAS
  children: ReactNode
}

export function Tela({ titulo, voltar, acao, marca, contas, largura = 'estreita', children }: Props) {
  const navigate = useNavigate()
  const aoVoltar = typeof voltar === 'function' ? voltar : voltar ? () => navigate(voltar) : undefined

  return (
    // A saída é o ganho aqui: o CSS animava só a entrada, porque na hora de desmontar
    // o elemento já não está no DOM para nenhum @keyframes rodar.
    <m.div
      className="scr"
      style={{ '--larg': `${LARGURAS[largura]}px` } as CSSProperties}
      variants={TELA}
      initial={aberturaSaiu() ? 'entra' : false}
      animate="parada"
      exit="sai"
      transition={CURVA}
    >
      <header className="nav">
        {aoVoltar && (
          <button className="voltar" onClick={aoVoltar} aria-label="Voltar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
        )}
        {marca && <Marca largura={26} />}
        <h1>{titulo}</h1>
        {acao}
        {contas && (
          <>
            <Sino />
            <Avatar />
          </>
        )}
      </header>
      <div className="bd">{children}</div>
    </m.div>
  )
}

// As iniciais (ou a foto do Google) no canto do cabeçalho; o toque leva ao perfil.
export function Avatar() {
  const navigate = useNavigate()
  const { perfil } = useUsuario()
  return (
    <button className="av av-bt" onClick={() => navigate('/perfil')} aria-label="Perfil">
      {perfil?.avatar_url ? (
        <img src={perfil.avatar_url} alt="" referrerPolicy="no-referrer" />
      ) : (
        perfil?.iniciais ?? '·'
      )}
    </button>
  )
}

// Título de seção: o nome à esquerda e uma nota curta à direita ("este mês", "4").
export function Secao({ titulo, nota, children }: { titulo: ReactNode; nota?: ReactNode; children?: ReactNode }) {
  return (
    <div className="secao">
      <h2>{titulo}</h2>
      {nota != null && <span className="note">{nota}</span>}
      {children}
    </div>
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
    <div className="scr" role="status" style={{ '--larg': `${LARGURAS.estreita}px` } as CSSProperties}>
      <div className="nav">
        <i className="esq" style={{ width: 140, height: 22, borderRadius: 6 }} />
      </div>
      <div className="bd">
        <i className="esq" style={{ height: 120, borderRadius: 20 }} />
        <i className="esq" style={{ height: 72 }} />
        <i className="esq" style={{ height: 72 }} />
      </div>
      <span className="so-leitor">Carregando…</span>
    </div>
  )
}

export function Vazio({ children }: { children: ReactNode }) {
  return <div className="dsh" style={{ padding: '28px 16px' }}>{children}</div>
}
