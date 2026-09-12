import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { carregarObra, criarConvite } from '../data/api'
import { useAsync } from '../lib/hooks'
import { useUsuario } from '../lib/auth'
import { useAviso } from '../components/Toast'
import { urlPublica } from '../lib/plataforma'
import { Carregando, Tela } from '../components/Tela'
import { Sheet } from '../components/Sheet'

export function Equipe() {
  const { obraId = '' } = useParams()
  const { userId } = useUsuario()
  const avisar = useAviso()
  const { dados, carregando, erro, recarregar } = useAsync(() => carregarObra(obraId), [obraId])
  const [link, setLink] = useState<string | null>(null)
  const [gerando, setGerando] = useState(false)

  // Sem isto a tela girava para sempre quando a carga falhava: `erro` nao era lido e
  // `dados` nulo caia no mesmo if do `carregando`, sem cabecalho nem caminho de volta.
  if (!dados) {
    return (
      <Tela titulo="Quem está na obra" voltar={`/obra/${obraId}`}>
        {carregando && <Carregando />}
        {erro && !carregando && (
          <>
            <div className="ann">Não deu para abrir a equipe: {erro}</div>
            <button className="bt" onClick={() => recarregar()}>tentar de novo</button>
          </>
        )}
      </Tela>
    )
  }

  const { obra, membros } = dados
  const souDono = obra.dono_id === userId

  async function convidar() {
    if (!souDono) return avisar('Só o dono da obra convida')
    setGerando(true)
    try {
      const convite = await criarConvite(obraId, userId)
      setLink(urlPublica(`/e/${convite.codigo}`))
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'não deu para gerar o convite')
    } finally {
      setGerando(false)
    }
  }

  async function copiar() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      avisar('Link do convite copiado')
    } catch {
      avisar('copie o link da tela')
    }
  }

  return (
    <>
      <Tela titulo="Quem está na obra" voltar={`/obra/${obraId}`}>
        <div className="note">{obra.nome}</div>

        {membros.map(m => (
          <div className="cd" key={m.user_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <div className="av">{m.profile.iniciais}</div>
            <div style={{ flex: 1 }}>
              <b style={{ fontSize: 14 }}>{m.profile.nome}</b>
              <div className="note">{m.papel === 'dono' ? 'dono da obra' : 'lança os próprios gastos'}</div>
            </div>
          </div>
        ))}

        {souDono && (
          <button className="bt" style={{ borderStyle: 'dashed', color: '#5B7392' }} onClick={convidar} disabled={gerando}>
            {gerando ? 'gerando…' : '+ convidar alguém'}
          </button>
        )}

        <div className="cd" style={{ background: '#E0F4FF', borderColor: '#1B8FE8', borderStyle: 'dashed' }}>
          <b style={{ fontSize: 14 }}>Como funciona a dois</b>
          <div className="note" style={{ color: '#123A73' }}>
            O histórico da obra é compartilhado: cada lançamento mostra quem enviou.
          </div>
          <div className="note" style={{ color: '#123A73' }}>
            Editar ou apagar, só quem lançou. O relatório soma os dois, nota a nota.
          </div>
        </div>
      </Tela>

      {link && (
        <Sheet aoFechar={() => setLink(null)}>
          <b style={{ fontSize: 17 }}>Convidar para {obra.nome}</b>
          <div className="fld" style={{ justifyContent: 'center', fontSize: 13.5, color: '#0A2A6E', wordBreak: 'break-all' }}>
            {link}
          </div>
          <div className="row" style={{ gap: 7 }}>
            <button className="bt" style={{ flex: 1, fontSize: 13.5, padding: 6 }} onClick={copiar}>Copiar</button>
            <a
              className="bt bta"
              style={{ flex: 1, fontSize: 13.5, padding: 6, textDecoration: 'none' }}
              href={`https://wa.me/?text=${encodeURIComponent(`Entra na obra ${obra.nome} no Alicerce: ${link}`)}`}
              target="_blank"
              rel="noreferrer"
            >
              WhatsApp
            </a>
          </div>
          <div className="ann">O convite vale por 7 dias e serve para uma pessoa.</div>
          <div className="note" style={{ textAlign: 'center', cursor: 'pointer' }} onClick={() => setLink(null)}>
            fechar
          </div>
        </Sheet>
      )}
    </>
  )
}
