import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { AnimatePresence, m } from 'motion/react'
import { apagarCategoria, carregarObra, criarCategoria, listarCategorias } from '../data/api'
import { useAsync } from '../lib/hooks'
import { useUsuario } from '../lib/auth'
import { useAviso } from '../components/Toast'
import { fmt } from '../lib/format'
import { CURVA } from '../lib/animacao'
import { Carregando, Tela } from '../components/Tela'
import { Sheet } from '../components/Sheet'
import type { Categoria } from '../lib/types'

const CORES = ['var(--azul)', 'var(--navy)', '#8CA3BF', 'var(--placeholder)', '#6CB4F0']

export function Categorias() {
  const { obraId = '' } = useParams()
  const { userId } = useUsuario()
  const avisar = useAviso()
  const [nova, setNova] = useState('')
  // Tocar na linha abre as ações, como no painel. Antes tocar apagava na hora.
  const [selecionada, setSelecionada] = useState<Categoria | null>(null)
  const [apagando, setApagando] = useState(false)

  const { dados, carregando, erro, recarregar } = useAsync(async () => {
    const completa = await carregarObra(obraId)
    const categorias = await listarCategorias(completa.obra.dono_id)
    return { completa, categorias }
  }, [obraId])

  // Sem isto a tela girava para sempre quando a carga falhava: `erro` nao era lido e
  // `dados` nulo caia no mesmo if do `carregando`, sem cabecalho nem caminho de volta.
  if (!dados) {
    return (
      <Tela titulo="Categorias" voltar={`/obra/${obraId}`}>
        {carregando && <Carregando />}
        {erro && !carregando && (
          <>
            <div className="ann ann-alerta">Não deu para abrir as categorias: {erro}</div>
            <button className="bt" onClick={() => recarregar()}>Tentar de novo</button>
          </>
        )}
      </Tela>
    )
  }

  const { completa, categorias } = dados
  const gastoPorCategoria = new Map<string, number>()
  completa.lancamentos
    .filter(l => l.tipo === 'saida' && l.categoria_id)
    .forEach(l => gastoPorCategoria.set(l.categoria_id!, (gastoPorCategoria.get(l.categoria_id!) ?? 0) + Number(l.valor)))

  async function adicionar() {
    const nome = nova.trim()
    if (!nome) return avisar('Escreva o nome da categoria')
    try {
      await criarCategoria({ donoId: completa.obra.dono_id, criadoPor: userId, nome })
      setNova('')
      avisar('Categoria criada')
      await recarregar()
    } catch (e) {
      const mensagem = e instanceof Error && /duplicate|unique/i.test(e.message) ? 'Essa categoria já existe' : 'não deu para criar'
      avisar(mensagem)
    }
  }

  async function remover(categoria: Categoria) {
    setApagando(true)
    try {
      await apagarCategoria(categoria.id)
      setSelecionada(null)
      avisar('Categoria apagada')
      await recarregar()
    } catch {
      avisar('só quem criou pode apagar')
    } finally {
      setApagando(false)
    }
  }

  const usado = selecionada ? gastoPorCategoria.get(selecionada.id) ?? 0 : 0

  return (
    <>
      <Tela titulo="Categorias" voltar={`/obra/${obraId}`}>
        <div className="note" style={{ fontSize: 13, lineHeight: 1.4, padding: '0 4px' }}>
          Valem para todas as obras. Os dois usuários usam a mesma lista.
        </div>

        <div style={{ display: 'flex', gap: 8, flex: 'none' }}>
          <input
            className="inp"
            aria-label="Nova categoria"
            placeholder="Nova categoria"
            value={nova}
            onChange={e => setNova(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && adicionar()}
            style={{ flex: 1, minWidth: 0 }}
          />
          <button className="bt bta" aria-label="Adicionar categoria" onClick={adicionar} style={{ width: 48, padding: 0 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>

        {categorias.length > 0 && (
          <div className="lista">
            {categorias.map((c, i) => {
              const gasto = gastoPorCategoria.get(c.id) ?? 0
              return (
                <m.button
                  key={c.id}
                  className="linha"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...CURVA, delay: Math.min(i, 8) * 0.035 }}
                  style={{ padding: '13px 0' }}
                  onClick={() => setSelecionada(c)}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <span style={{ width: 12, height: 12, borderRadius: 4, background: CORES[i % CORES.length], display: 'block', flex: 'none' }} />
                    <b style={{ fontSize: 14.5 }}>{c.nome}</b>
                  </span>
                  <span className={gasto ? 'num' : undefined} style={{ fontSize: 13, color: 'var(--texto-secundario)', flex: 'none' }}>
                    {gasto ? fmt(gasto) : 'sem uso'}
                  </span>
                </m.button>
              )
            })}
          </div>
        )}

        <div className="ann">O agente sugere a categoria pelo fornecedor, mas quem manda é a sua lista.</div>
      </Tela>

      <AnimatePresence>
        {selecionada && (
          <Sheet aoFechar={() => setSelecionada(null)}>
            <div className="sheet-titulo">
              <b>{selecionada.nome}</b>
              <span className={usado ? 'note num' : 'note'}>{usado ? fmt(usado) : 'sem uso'}</span>
            </div>

            {usado > 0 ? (
              <div className="ann">
                Já tem gasto lançado nesta categoria. Apagar deixaria esses lançamentos sem classificação, então
                ela fica.
              </div>
            ) : selecionada.criado_por !== userId ? (
              <div className="ann">Só quem criou a categoria pode apagar.</div>
            ) : (
              <button className="bt" onClick={() => remover(selecionada)} disabled={apagando}>
                {apagando ? 'apagando…' : 'Apagar categoria'}
              </button>
            )}

            <button className="bt-texto" onClick={() => setSelecionada(null)}>
              fechar
            </button>
          </Sheet>
        )}
      </AnimatePresence>
    </>
  )
}
