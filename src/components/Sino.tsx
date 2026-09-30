import { useLocation, useNavigate } from 'react-router-dom'
import { useNotificacoes } from '../lib/notificacoes'

// O sino do cabeçalho, com quantos avisos da equipe ainda não foram vistos.
export function Sino() {
  const navigate = useNavigate()
  const location = useLocation()
  const { naoLidas } = useNotificacoes()

  return (
    <button
      className="sino"
      onClick={() => navigate('/notificacoes', { state: { de: location.pathname } })}
      aria-label={naoLidas ? `Notificações: ${naoLidas} ${naoLidas === 1 ? 'nova' : 'novas'}` : 'Notificações'}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M18 15.6V11a6 6 0 0 0-12 0v4.6L4.4 18h15.2z" />
        <path d="M10 20.6a2.2 2.2 0 0 0 4 0" />
      </svg>
      {naoLidas > 0 && <span className="sino-n">{naoLidas > 9 ? '9+' : naoLidas}</span>}
    </button>
  )
}
