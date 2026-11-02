import { useNavigate, useParams } from 'react-router-dom'
import { m } from 'motion/react'
import { listarNotas, type NotaEnviada } from '../data/api'
import { useAsync } from '../lib/hooks'
import { useUsuario } from '../lib/auth'
import { dataCurta, fmt } from '../lib/format'
import { CURVA } from '../lib/animacao'
import { Carregando, Tela } from '../components/Tela'

// As notas fiscais da obra num lugar só: as da pessoa, e as que o sócio já lançou (0015).
// Antes, depois de lançada, a nota sumia da fila e não havia como ver o arquivo de novo.
export function Notas() {
  const { obraId = '' } = useParams()
  const navigate = useNavigate()
  const { userId } = useUsuario()
  const { dados, carregando, erro, recarregar } = useAsync(() => listarNotas(obraId), [obraId])

  return (
    <Tela titulo="Notas fiscais" voltar={`/obra/${obraId}`}>
      {carregando && !dados && <Carregando />}

      {erro && !carregando && (
        <>
          <div className="ann ann-alerta">Não deu para abrir as notas: {erro}</div>
          <button className="bt" onClick={() => recarregar()}>Tentar de novo</button>
        </>
      )}

      {dados && dados.length === 0 && (
        <div className="dsh" style={{ padding: 18 }}>Nenhuma nota enviada nesta obra ainda</div>
      )}

      {dados && dados.length > 0 && (
        <>
          <div className="lista">
            {dados.map((nota, i) => (
              <LinhaNota
                key={nota.comprovante.id}
                nota={nota}
                ordem={i}
                userId={userId}
                aoConferir={() => navigate(`/obra/${obraId}/revisar/${nota.comprovante.id}`)}
              />
            ))}
          </div>
          <div className="note" style={{ textAlign: 'center', fontSize: 13 }}>Toque na nota para abrir o arquivo.</div>
        </>
      )}
    </Tela>
  )
}

function LinhaNota({
  nota,
  ordem,
  userId,
  aoConferir,
}: {
  nota: NotaEnviada
  ordem: number
  userId: string
  aoConferir: () => void
}) {
  const { comprovante: c, autor, url, lancamento } = nota
  const quem = c.autor_id === userId ? 'você' : (autor?.nome ?? '').split(' ')[0] || 'equipe'
  const lido = c.extraido
  const titulo = lancamento?.descricao || lido?.fornecedor || 'Nota enviada'
  const valor = lancamento?.valor ?? lido?.valor ?? null
  const data = lancamento?.data ? dataCurta(lancamento.data) : dataCurta(c.created_at.slice(0, 10))
  const ehImagem = (c.mime ?? '').startsWith('image/')
  // Pendente só aparece da própria fila: a do sócio a RLS não entrega.
  const pendente = c.status !== 'confirmado' && c.autor_id === userId

  return (
    <m.div
      className="linha"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...CURVA, delay: Math.min(ordem, 8) * 0.035 }}
      style={{ gap: 12 }}
    >
      {/* O arquivo abre no navegador: foto em tela cheia, PDF no leitor do aparelho. O
          "conferir" fica fora do link, porque leva a outro lugar (a ficha do Revisar). */}
      <a
        href={url ?? undefined}
        target="_blank"
        rel="noreferrer"
        style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, color: 'inherit', textDecoration: 'none' }}
      >
        <span
          style={{
            width: 44,
            height: 44,
            flex: 'none',
            borderRadius: 10,
            border: '1px solid var(--linha)',
            background: 'var(--fundo)',
            color: 'var(--texto-secundario)',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {ehImagem && url ? (
            <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 3h12v18l-2-1.5L14 21l-2-1.5L10 21l-2-1.5L6 21z" />
              <path d="M9 8h6M9 11.5h6M9 15h4" />
            </svg>
          )}
        </span>
        <span className="linha-txt">
          <b style={{ fontSize: 14 }}>{titulo}</b>
          <span className="note">
            {data + ' · ' + quem}
            {valor != null && ` · ${fmt(valor)}`}
            {!url && ' · arquivo indisponível'}
          </span>
        </span>
      </a>
      {pendente ? (
        <button className="chip" onClick={aoConferir}>
          {c.status === 'lendo' ? 'lendo…' : 'conferir'}
        </button>
      ) : (
        // O `.chip` do CSS vem depois do `.bta` e repõe o fundo branco; o azul vai à mão.
        <span className="chip bta" style={{ background: 'var(--azul-700)', borderColor: 'var(--azul-700)' }}>lançada</span>
      )}
    </m.div>
  )
}
