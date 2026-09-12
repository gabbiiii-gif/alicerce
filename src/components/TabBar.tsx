import { useLocation, useNavigate } from 'react-router-dom'
import { useObraAtual } from '../lib/obraAtual'
import { useAviso } from './Toast'

type Aba = 'obras' | 'enviar' | 'relatorios' | 'perfil'

export function TabBar({ ativa }: { ativa: Aba }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { obraId } = useObraAtual()
  const avisar = useAviso()

  function irPara(aba: Aba) {
    if (aba === 'obras') return navigate('/')
    if (aba === 'perfil') return navigate('/perfil')
    // Relatórios não depende de obra: sem nenhuma escolhida, abre o consolidado.
    if (aba === 'relatorios' && !obraId) return navigate('/relatorios')
    if (!obraId) {
      avisar('Escolha uma obra primeiro')
      return navigate('/')
    }
    navigate(aba === 'enviar' ? `/obra/${obraId}/enviar` : `/obra/${obraId}/relatorios`, {
      state: { de: location.pathname },
    })
  }

  const cor = (aba: Aba) => (ativa === aba ? '#1B8FE8' : 'none')

  return (
    <div className="tb">
      <button className={ativa === 'obras' ? 'ativa' : ''} onClick={() => irPara('obras')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
          <rect x="7" y="4.6" width="10" height="3.6" rx="1" fill={cor('obras')} />
          <rect x="4.5" y="10.2" width="15" height="3.6" rx="1" />
          <rect x="6.2" y="15.8" width="11.6" height="3.6" rx="1" />
        </svg>
        Obras
      </button>
      <button className={ativa === 'enviar' ? 'ativa' : ''} onClick={() => irPara('enviar')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4.2 14.4v3.9c0 .9.7 1.6 1.6 1.6h12.4c.9 0 1.6-.7 1.6-1.6v-3.9" fill={cor('enviar')} />
          <path d="M12 3.8v10.2" />
          <path d="M7.7 8.1 12 3.8l4.3 4.3" />
        </svg>
        Enviar
      </button>
      <button className={ativa === 'relatorios' ? 'ativa' : ''} onClick={() => irPara('relatorios')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
          <rect x="4" y="12.4" width="4.4" height="7" rx="1.2" fill={cor('relatorios')} />
          <rect x="9.8" y="8.4" width="4.4" height="11" rx="1.2" />
          <rect x="15.6" y="4.6" width="4.4" height="14.8" rx="1.2" />
        </svg>
        Relatórios
      </button>
      <button className={ativa === 'perfil' ? 'ativa' : ''} onClick={() => irPara('perfil')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <circle cx="12" cy="8.4" r="3.7" fill={cor('perfil')} />
          <path d="M5.2 19.8c0-3.5 3-5.6 6.8-5.6s6.8 2.1 6.8 5.6" />
        </svg>
        Perfil
      </button>
    </div>
  )
}
