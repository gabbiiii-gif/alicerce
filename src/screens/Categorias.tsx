import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { apagarCategoria, carregarObra, criarCategoria, listarCategorias } from '../data/api'
import { useAsync } from '../lib/hooks'
import { useUsuario } from '../lib/auth'
import { useAviso } from '../components/Toast'
import { fmt } from '../lib/format'
import { Carregando, Tela } from '../components/Tela'

const CORES = ['#1B8FE8', '#0A2A6E', '#8CA3BF', '#B9CFE8', '#6CB4F0']

export function Categorias() {
  const { obraId = '' } = useParams()
  const { userId } = useUsuario()
  const avisar = useAviso()
  const [nova, setNova] = useState('')

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

  async function remover(id: string, nome: string) {
    if (gastoPorCategoria.get(id)) return avisar(`"${nome}" já tem gasto lançado`)
    try {
      await apagarCategoria(id)
      await recarregar()
      avisar('Categoria apagada')
    } catch {
      avisar('só quem criou pode apagar')
    }
  }

  return (
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
        const usado = gastoPorCategoria.get(c.id) ?? 0
        return (
          <button key={c.id} className="li" onClick={() => remover(c.id, c.nome)}>
            <div className="row" style={{ gap: 7 }}>
              <span style={{ width: 13, height: 13, borderRadius: 3, background: CORES[i % CORES.length], display: 'block' }} />
              <b style={{ fontSize: 14 }}>{c.nome}</b>
            </div>
            <span className="note">{usado ? fmt(usado) : 'sem uso'}</span>
          </button>
        )
      })}

      <div className="ann">O agente sugere a categoria pelo fornecedor, mas quem manda é a sua lista.</div>
    </Tela>
  )
}
