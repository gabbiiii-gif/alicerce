import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { enviarRelatorioPorEmail, listarObras } from '../data/api'
import { useAsync } from '../lib/hooks'
import { useAuth, useUsuario } from '../lib/auth'
import { useObraAtual } from '../lib/obraAtual'
import { useAviso } from '../components/Toast'
import { Tela } from '../components/Tela'
import { TabBar } from '../components/TabBar'
import { Sheet } from '../components/Sheet'

export function Perfil() {
  const navigate = useNavigate()
  const { session, sair } = useAuth()
  const { userId, perfil } = useUsuario()
  const { obraId } = useObraAtual()
  const avisar = useAviso()
  const { dados: obras } = useAsync(listarObras, [])
  const [enviando, setEnviando] = useState(false)
  const [destino, setDestino] = useState<string | null>(null)

  async function mandarEmail(para?: string) {
    setEnviando(true)
    try {
      const enviado = await enviarRelatorioPorEmail(para)
      setDestino(null)
      avisar(`Resumo enviado para ${enviado}`)
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'não deu para enviar o e-mail')
    } finally {
      setEnviando(false)
    }
  }

  const minhas = obras ?? []
  const souDono = minhas.some(o => o.dono_id === userId)

  function abrir(destino: 'categorias' | 'equipe') {
    if (!obraId) {
      avisar('Escolha uma obra primeiro')
      return navigate('/obras')
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
        <button className="li" onClick={() => setDestino(session?.user.email ?? '')} disabled={enviando}>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <b style={{ fontSize: 14 }}>Relatório por e-mail</b>
            <div className="note">resumo das obras, na hora</div>
          </div>
          <span className="note">{enviando ? 'enviando…' : '›'}</span>
        </button>
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

      {destino !== null && (
        <Sheet aoFechar={() => setDestino(null)}>
          <b style={{ fontSize: 17 }}>Mandar o resumo por e-mail</b>
          <span className="note">
            Vai o resumo de todas as obras que você vê: recebido, gasto e quanto falta em cada uma.
          </span>
          <input
            className="inp"
            type="email"
            inputMode="email"
            autoCapitalize="none"
            placeholder="para quem?"
            value={destino}
            onChange={e => setDestino(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && mandarEmail(destino)}
          />
          <button
            className="bt btp"
            style={{ width: '100%' }}
            onClick={() => mandarEmail(destino)}
            disabled={enviando || !destino.trim()}
          >
            {enviando ? 'enviando…' : 'Enviar agora'}
          </button>
          <div className="ann">
            Enquanto não houver um domínio próprio verificado, o serviço de e-mail só entrega na
            caixa de quem é dono da conta dele.
          </div>
        </Sheet>
      )}
    </>
  )
}
