import { useNavigate, useParams } from 'react-router-dom'
import { motion } from 'motion/react'
import { listarNotas, type NotaEnviada } from '../data/api'
import { useAsync } from '../lib/hooks'
import { useUsuario } from '../lib/auth'
import { dataCurta, semSimbolo } from '../lib/format'
import { CURVA } from '../lib/animacao'
import { Carregando, Tela } from '../components/Tela'

// Todas as notas que a pessoa mandou nesta obra, num lugar só. Antes, depois de lançada, a
// nota sumia da fila e não havia como ver o arquivo de novo.
export function Notas() {
  const { obraId = '' } = useParams()
  const navigate = useNavigate()
  const { userId } = useUsuario()
  const { dados, carregando, erro, recarregar } = useAsync(() => listarNotas(obraId, userId), [obraId, userId])

  return (
    <Tela titulo="Notas fiscais" voltar={`/obra/${obraId}`}>
      {carregando && !dados && <Carregando />}

      {erro && !carregando && (
        <>
          <div className="ann">Não deu para abrir as notas: {erro}</div>
          <button className="bt" onClick={() => recarregar()}>Tentar de novo</button>
        </>
      )}

      {dados && dados.length === 0 && (
        <div className="dsh" style={{ padding: 18 }}>Nenhuma nota enviada nesta obra ainda</div>
      )}

      {dados?.map((nota, i) => (
        <motion.div
          key={nota.comprovante.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...CURVA, delay: Math.min(i, 8) * 0.035 }}
        >
          <LinhaNota nota={nota} aoConferir={() => navigate(`/obra/${obraId}/revisar/${nota.comprovante.id}`)} />
        </motion.div>
      ))}

      {dados && dados.length > 0 && (
        <div className="note" style={{ textAlign: 'center' }}>Toque na nota para abrir o arquivo.</div>
      )}
    </Tela>
  )
}

function LinhaNota({ nota, aoConferir }: { nota: NotaEnviada; aoConferir: () => void }) {
  const { comprovante: c, url, lancamento } = nota
  const lido = c.extraido
  const titulo = lancamento?.descricao || lido?.fornecedor || 'Nota enviada'
  const valor = lancamento?.valor ?? lido?.valor ?? null
  const data = lancamento?.data ? dataCurta(lancamento.data) : dataCurta(c.created_at.slice(0, 10))
  const ehImagem = (c.mime ?? '').startsWith('image/')
  const pendente = c.status !== 'confirmado'

  return (
    <div className="li" style={{ gap: 10, cursor: 'default' }}>
      {/* O arquivo abre no navegador: foto em tela cheia, PDF no leitor do aparelho. */}
      <a
        href={url ?? undefined}
        target="_blank"
        rel="noreferrer"
        style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, color: 'inherit', textDecoration: 'none' }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            flex: 'none',
            borderRadius: 8,
            border: '1px solid #E1EAF6',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            color: '#8CA3BF',
          }}
        >
          {ehImagem && url ? (
            <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            'PDF'
          )}
        </div>
        <div style={{ minWidth: 0 }}>
          <b style={{ fontSize: 13.5, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {titulo}
          </b>
          <div className="note">
            {data}
            {valor != null && ` · ${semSimbolo(valor)}`}
            {!url && ' · arquivo indisponível'}
          </div>
        </div>
      </a>
      {pendente ? (
        <button className="chip" onClick={aoConferir} style={{ whiteSpace: 'nowrap' }}>
          {c.status === 'lendo' ? 'lendo…' : 'conferir'}
        </button>
      ) : (
        <span className="chip bta" style={{ background: '#1B8FE8', borderColor: '#1B8FE8', whiteSpace: 'nowrap' }}>lançada</span>
      )}
    </div>
  )
}
