import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { apagarCategoria, carregarObra, criarCategoria, listarCategorias } from '../data/api'
import { useAsync } from '../lib/hooks'
import { useUsuario } from '../lib/auth'
import { useAviso } from '../components/Toast'
import { fmt } from '../lib/format'
import { CURVA } from '../lib/animacao'
import { Carregando, Tela } from '../components/Tela'
import { Sheet } from '../components/Sheet'
import type { Categoria } from '../lib/types'

const CORES = ['#1B8FE8', '#0A2A6E', '#8CA3BF', '#B9CFE8', '#6CB4F0']

export function Categorias() {
  const { obraId = '' } = useParams()
  const { userId } = useUsuario()
  const avisar = useAviso()
  const [nova, setNova] = useState('')
  // Tocar na linha abre as ações, como no painel. Antes tocar apagava na hora.
  const [selecionada, setSelecionada] = useState<Categoria | null>(null)
  const [apagando, setApagando] = useState(false)

  const { dados, carregando, recarregar } = useAsync(async () => {
    const completa = await carregarObra(obraId)
    const categorias = await listarCategorias(completa.obra.dono_id)
    return { completa, categorias }
  }, [obraId])

  if (carregando || !dados) return <Carregando />

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
        <div className="note">Valem para todas as obras. Os dois usuários usam a mesma lista.</div>

        <div className="row" style={{ gap: 7 }}>
          <input
            className="inp"
            placeholder="nova categoria"
            value={nova}
            onChange={e => setNova(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && adicionar()}
            style={{ flex: 1 }}
          />
          <button className="bt bta" style={{ padding: '7px 14px' }} onClick={adicionar}>+</button>
        </div>

        {categorias.map((c, i) => {
          const gasto = gastoPorCategoria.get(c.id) ?? 0
          return (
            <motion.button
              key={c.id}
              className="li"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...CURVA, delay: Math.min(i, 8) * 0.035 }}
              onClick={() => setSelecionada(c)}
            >
              <div className="row" style={{ gap: 7 }}>
                <span style={{ width: 13, height: 13, borderRadius: 3, background: CORES[i % CORES.length], display: 'block' }} />
                <b style={{ fontSize: 14 }}>{c.nome}</b>
              </div>
              <span className="note">{gasto ? fmt(gasto) : 'sem uso'}</span>
            </motion.button>
          )
        })}

        <div className="ann">O agente sugere a categoria pelo fornecedor, mas quem manda é a sua lista.</div>
      </Tela>

      <AnimatePresence>
        {selecionada && (
          <Sheet aoFechar={() => setSelecionada(null)}>
            <div className="row">
              <b style={{ fontSize: 17 }}>{selecionada.nome}</b>
              <span className="note">{usado ? fmt(usado) : 'sem uso'}</span>
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

            <div className="note" style={{ textAlign: 'center', cursor: 'pointer' }} onClick={() => setSelecionada(null)}>
              fechar
            </div>
          </Sheet>
        )}
      </AnimatePresence>
    </>
  )
}
