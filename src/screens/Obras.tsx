import { useNavigate } from 'react-router-dom'
import { listarObras } from '../data/api'
import { useAsync } from '../lib/hooks'
import { useObraAtual } from '../lib/obraAtual'
import { fmt } from '../lib/format'
import { Carregando, Tela, Vazio } from '../components/Tela'
import { Barra } from '../components/Barra'
import { m } from 'motion/react'
import { CURVA } from '../lib/animacao'
import { useNovidades } from '../lib/notificacoes'

export function Obras() {
  const navigate = useNavigate()
  const { definir } = useObraAtual()
  const { dados: obras, carregando, erro, recarregar } = useAsync(listarObras, [])

  // Obra nova, encerrada ou apagada pelo sócio aparece aqui sem precisar sair e voltar.
  useNovidades(() => recarregar())

  function abrir(id: string) {
    definir(id)
    navigate(`/obra/${id}`)
  }

  return (
    <>
      <Tela
        titulo="Minhas obras"
        marca
        contas
        largura="larga"
        acao={
          // No desktop não há botão redondo: criar obra fica no cabeçalho, à vista.
          <button
            className="bt btp so-largo"
            onClick={() => navigate('/nova')}
            style={{ minHeight: 40, height: 40, borderRadius: 12, fontSize: 14, padding: '0 14px', gap: 6 }}
          >
            + Nova obra
          </button>
        }
      >
        {/* Só na primeira carga: recarregar com a lista na tela não pisca o indicador. */}
        {carregando && !obras && <Carregando />}
        {erro && <div className="ann">Não deu para carregar as obras: {erro}</div>}

        {obras && obras.length > 0 && (
          // Quantas colunas couberem, cada cartão com no mínimo 300 px: uma no celular,
          // três num monitor largo.
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))',
              gap: 12,
              flex: 'none',
            }}
          >
            {obras.map((obra, i) => {
              const encerrada = obra.status === 'encerrada'
              return (
                // Os cartões entram em cascata, e o toque afunda um pouco — retorno tátil
                // que o CSS :active dava só no desktop, com mouse.
                <m.button
                  key={obra.id}
                  className="cd"
                  style={{ padding: '14px 16px', gap: 10 }}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: encerrada ? 0.72 : 1, y: 0 }}
                  transition={{ ...CURVA, delay: Math.min(i, 8) * 0.045 }}
                  whileTap={{ scale: 0.985 }}
                  onClick={() => abrir(obra.id)}
                >
                  <span className="row" style={{ gap: 10 }}>
                    <b
                      style={{
                        fontSize: 16,
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {obra.nome}
                    </b>
                    <span
                      className="chip chip-num"
                      style={encerrada ? { background: 'var(--fundo)', color: 'var(--texto-secundario)' } : undefined}
                    >
                      {encerrada ? 'encerrada' : `${obra.contas.pct}%`}
                    </span>
                  </span>
                  <span className="note" style={{ fontSize: 13 }}>{obra.endereco || 'sem endereço'}</span>
                  {/* Obra encerrada fica com a barra apagada: o número continua lá, mas não
                      disputa a atenção com as que ainda estão andando. */}
                  <Barra pct={obra.contas.pct} cor={encerrada ? 'var(--placeholder)' : 'var(--navy)'} altura={6} />
                  <span className="row" style={{ fontSize: 13, color: 'var(--texto-secundario)' }}>
                    <span>
                      Recebido <span className="num" style={{ color: 'var(--navy)' }}>{fmt(obra.contas.recebido)}</span>
                    </span>
                    <span>
                      Em aberto <span className="num" style={{ color: 'var(--navy)' }}>{fmt(obra.contas.aberto)}</span>
                    </span>
                  </span>
                </m.button>
              )
            })}
          </div>
        )}

        {obras?.length === 0 && (
          <Vazio>
            nenhuma obra ainda
            <br />
            <span style={{ fontSize: 12 }}>Toque no + para cadastrar</span>
          </Vazio>
        )}
      </Tela>
      <button className="fab" onClick={() => navigate('/nova')} aria-label="Nova obra">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </>
  )
}
