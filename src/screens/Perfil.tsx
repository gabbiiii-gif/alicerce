import { useNavigate } from 'react-router-dom'
import { listarObras } from '../data/api'
import { useAsync } from '../lib/hooks'
import { useAuth, useUsuario } from '../lib/auth'
import { useObraAtual } from '../lib/obraAtual'
import { useAviso } from '../components/Toast'
import { Tela } from '../components/Tela'
import { TabBar } from '../components/TabBar'

export function Perfil() {
  const navigate = useNavigate()
  const { session, sair } = useAuth()
  const { userId, perfil } = useUsuario()
  const { obraId } = useObraAtual()
  const avisar = useAviso()
  const { dados: obras } = useAsync(listarObras, [])

  const minhas = obras ?? []
  const souDono = minhas.some(o => o.dono_id === userId)

  function abrir(destino: 'categorias' | 'equipe') {
    if (!obraId) {
      avisar('Escolha uma obra primeiro')
      return navigate('/')
    }
    navigate(`/obra/${obraId}/${destino}`)
  }

  return (
    <>
      <Tela titulo="Perfil" comAbas>
        <div className="cd" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {/* Quem entrou pelo Google já tem foto; os outros ficam com as iniciais. */}
          {perfil?.avatar_url ? (
            <img className="av" src={perfil.avatar_url} alt="" referrerPolicy="no-referrer" />
          ) : (
            <div className="av">{perfil?.iniciais ?? '·'}</div>
          )}
          <div style={{ flex: 1 }}>
            <b style={{ fontSize: 15 }}>{perfil?.nome ?? 'você'}</b>
            <div className="note">{souDono ? 'dono de obra' : 'lança os próprios gastos'} · {session?.user.email}</div>
          </div>
        </div>

        <button className="li" onClick={() => abrir('categorias')}>
          <b style={{ fontSize: 14 }}>Categorias de gasto</b>
          <span className="note">›</span>
        </button>
        <button className="li" onClick={() => abrir('equipe')}>
          <b style={{ fontSize: 14 }}>Equipe da obra</b>
          <span className="note">›</span>
        </button>
        <div className="li" style={{ cursor: 'default', opacity: .6 }}>
          <b style={{ fontSize: 14 }}>Relatório por e-mail</b>
          <span className="note">em breve</span>
        </div>
        <div className="li" style={{ cursor: 'default', opacity: .6 }}>
          <b style={{ fontSize: 14 }}>Resumo no WhatsApp</b>
          <span className="note">em breve</span>
        </div>

        <div className="ann">
          O histórico de cada obra é compartilhado com quem está nela: todo lançamento mostra quem enviou, e só quem lançou pode
          apagar.
        </div>

        <div style={{ marginTop: 'auto' }}>
          <button className="bt" style={{ width: '100%' }} onClick={() => sair()}>Sair</button>
        </div>
      </Tela>
      <TabBar ativa="perfil" />
    </>
  )
}
