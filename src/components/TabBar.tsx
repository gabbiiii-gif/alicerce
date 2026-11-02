import { matchPath, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useObraAtual } from '../lib/obraAtual'
import { useAviso } from './Toast'
import { Assinatura } from './Marca'

type Aba = 'resumo' | 'obras' | 'enviar' | 'relatorios' | 'perfil'

// Cada rota acende a aba da seção a que pertence. A ordem importa: as rotas da obra que
// são de outra seção (enviar, relatórios) vêm antes da regra geral "/obra/*", que é Obras.
const SECOES: Array<[string, Aba]> = [
  ['/', 'resumo'],
  ['/notificacoes', 'resumo'],
  ['/obra/:obraId/enviar', 'enviar'],
  ['/obra/:obraId/revisar/:comprovanteId', 'enviar'],
  ['/obra/:obraId/lancar', 'enviar'],
  ['/obra/:obraId/relatorios', 'relatorios'],
  ['/relatorios', 'relatorios'],
  ['/obras', 'obras'],
  ['/nova', 'obras'],
  ['/obra/*', 'obras'],
  ['/perfil', 'perfil'],
  ['/plano', 'perfil'],
]

function abaDe(caminho: string): Aba | null {
  return SECOES.find(([padrao]) => matchPath(padrao, caminho))?.[1] ?? null
}

// A navegação entre seções, igual no menu lateral e nas abas.
function useIrPara() {
  const navigate = useNavigate()
  const location = useLocation()
  const { obraId } = useObraAtual()
  const avisar = useAviso()

  return (aba: Aba) => {
    if (aba === 'resumo') return navigate('/')
    if (aba === 'obras') return navigate('/obras')
    if (aba === 'perfil') return navigate('/perfil')
    // Relatórios não depende de obra: sem nenhuma escolhida, abre o consolidado.
    if (aba === 'relatorios' && !obraId) return navigate('/relatorios')
    if (!obraId) {
      avisar('Escolha uma obra primeiro')
      return navigate('/obras')
    }
    navigate(aba === 'enviar' ? `/obra/${obraId}/enviar` : `/obra/${obraId}/relatorios`, {
      state: { de: location.pathname },
    })
  }
}

// Os ícones das cinco seções. O da seção ativa ganha um bloco cheio em azul.
function Icone({ aba, ativa }: { aba: Aba; ativa: boolean }) {
  const cheio = ativa ? '#1B8FE8' : 'none'
  if (aba === 'resumo')
    return (
      // Quatro quadrantes: o ícone de painel, distinto das barras de relatório.
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
        <rect x="4" y="4" width="7" height="7" rx="1.4" fill={cheio} />
        <rect x="13" y="4" width="7" height="4.6" rx="1.4" />
        <rect x="4" y="13" width="7" height="7" rx="1.4" />
        <rect x="13" y="10.6" width="7" height="9.4" rx="1.4" />
      </svg>
    )
  if (aba === 'obras')
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
        <rect x="7" y="4.6" width="10" height="3.6" rx="1" fill={cheio} />
        <rect x="4.5" y="10.2" width="15" height="3.6" rx="1" />
        <rect x="6.2" y="15.8" width="11.6" height="3.6" rx="1" />
      </svg>
    )
  if (aba === 'enviar')
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4.2 14.4v3.9c0 .9.7 1.6 1.6 1.6h12.4c.9 0 1.6-.7 1.6-1.6v-3.9" fill={cheio} />
        <path d="M12 3.8v10.2" />
        <path d="M7.7 8.1 12 3.8l4.3 4.3" />
      </svg>
    )
  if (aba === 'relatorios')
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
        <rect x="4" y="12.4" width="4.4" height="7" rx="1.2" fill={cheio} />
        <rect x="9.8" y="8.4" width="4.4" height="11" rx="1.2" />
        <rect x="15.6" y="4.6" width="4.4" height="14.8" rx="1.2" />
      </svg>
    )
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="8.4" r="3.7" fill={cheio} />
      <path d="M5.2 19.8c0-3.5 3-5.6 6.8-5.6s6.8 2.1 6.8 5.6" />
    </svg>
  )
}

const ROTULOS: Array<[Aba, string]> = [
  ['resumo', 'Resumo'],
  ['obras', 'Obras'],
  ['enviar', 'Enviar'],
  ['relatorios', 'Relatórios'],
  ['perfil', 'Perfil'],
]

// Abas embaixo, no celular. "Enviar" é o botão saltado do meio: mandar comprovante é o
// que mais se faz no canteiro.
export function TabBar() {
  const { pathname } = useLocation()
  const irPara = useIrPara()
  const ativa = abaDe(pathname)

  return (
    <nav className="tb" aria-label="Seções do app">
      {ROTULOS.map(([aba, rotulo]) => (
        <button
          key={aba}
          className={(ativa === aba ? 'ativa ' : '') + (aba === 'enviar' ? 'tb-enviar' : '')}
          aria-current={ativa === aba ? 'page' : undefined}
          onClick={() => irPara(aba)}
        >
          {aba === 'enviar' ? (
            <span className="tb-saltado">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4.2 14.4v3.9c0 .9.7 1.6 1.6 1.6h12.4c.9 0 1.6-.7 1.6-1.6v-3.9" />
                <path d="M12 3.8v10.2" />
                <path d="M7.7 8.1 12 3.8l4.3 4.3" />
              </svg>
            </span>
          ) : (
            <Icone aba={aba} ativa={ativa === aba} />
          )}
          {rotulo}
        </button>
      ))}
    </nav>
  )
}

// Menu lateral, no desktop: as mesmas seções, com a marca no topo e quem está logado no pé.
export function MenuLateral() {
  const { pathname } = useLocation()
  const irPara = useIrPara()
  const { session, perfil } = useAuth()
  const ativa = abaDe(pathname)

  return (
    <nav className="rail" aria-label="Seções do app">
      <div className="rail-topo">
        <Assinatura />
      </div>
      {ROTULOS.map(([aba, rotulo]) => (
        <button
          key={aba}
          className={ativa === aba ? 'ativa' : ''}
          aria-current={ativa === aba ? 'page' : undefined}
          onClick={() => irPara(aba)}
        >
          <Icone aba={aba} ativa={ativa === aba} />
          {rotulo}
        </button>
      ))}
      <div className="rail-pe">
        {perfil?.avatar_url ? (
          <img className="av" src={perfil.avatar_url} alt="" referrerPolicy="no-referrer" />
        ) : (
          <span className="av">{perfil?.iniciais ?? '·'}</span>
        )}
        <span className="rail-quem">
          <b>{perfil?.nome ?? 'Sua conta'}</b>
          {session?.user.email && <span className="note">{session.user.email}</span>}
        </span>
      </div>
    </nav>
  )
}
