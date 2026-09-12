import type { Lancamento, Membro } from './types'
import { fmt, isoParaBR } from './format'
import { mesDe, semanaDe } from './format'

export type Periodo = 'semana' | 'mes'

export type ResumoPessoa = {
  userId: string
  nome: string
  iniciais: string
  total: number
  itens: { esquerda: string; direita: string }[]
}

export type ResumoObra = {
  id: string
  nome: string
  entradas: number
  saidas: number
}

export type Relatorio = {
  titulo: string
  inicio: string
  fim: string
  entradas: number
  saidas: number
  porCategoria: { nome: string; valor: number; pct: number }[]
  porPessoa: ResumoPessoa[]
  // Vazio no relatório de uma obra só: ali a quebra por obra não diria nada.
  porObra: ResumoObra[]
}

export function montarRelatorio(
  lancamentos: Lancamento[],
  membros: Membro[],
  periodo: Periodo,
  base = new Date(),
): Relatorio {
  const janela = periodo === 'semana' ? semanaDe(base) : mesDe(base)
  const doPeriodo = lancamentos.filter(l => l.data >= janela.inicio && l.data <= janela.fim)

  const entradas = doPeriodo.filter(l => l.tipo === 'entrada').reduce((s, l) => s + Number(l.valor), 0)
  const saidas = doPeriodo.filter(l => l.tipo === 'saida').reduce((s, l) => s + Number(l.valor), 0)

  const totalPorCategoria = new Map<string, number>()
  doPeriodo
    .filter(l => l.tipo === 'saida')
    .forEach(l => {
      const nome = l.categoria?.nome ?? 'sem categoria'
      totalPorCategoria.set(nome, (totalPorCategoria.get(nome) ?? 0) + Number(l.valor))
    })
  const maior = Math.max(1, ...totalPorCategoria.values())
  const porCategoria = [...totalPorCategoria.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([nome, valor]) => ({ nome, valor, pct: Math.round((valor / maior) * 100) }))

  // Quem entra na quebra: os membros da obra MAIS quem lançou no período.
  //
  // Só os membros não basta desde que sócios passaram a ver e lançar em obras do grupo sem
  // estar em obra_membros. O gasto entrava no total de saídas e sumia da lista por pessoa —
  // a tela mostrava "saídas −1.235" e, logo abaixo, todo mundo com "sem saídas no período".
  const pessoas = new Map<string, { userId: string; nome: string; iniciais: string }>()
  membros.forEach(m =>
    pessoas.set(m.user_id, { userId: m.user_id, nome: m.profile.nome, iniciais: m.profile.iniciais }),
  )
  doPeriodo.forEach(l => {
    if (l.tipo !== 'saida' || pessoas.has(l.autor_id)) return
    // Sem o perfil (a RLS pode não devolvê-lo), ainda é melhor mostrar o gasto sob um rótulo
    // genérico do que deixar dinheiro fora da conta de alguém.
    pessoas.set(l.autor_id, {
      userId: l.autor_id,
      nome: l.autor?.nome ?? 'alguém da equipe',
      iniciais: l.autor?.iniciais ?? '··',
    })
  })

  const porPessoa = [...pessoas.values()].map(pessoa => {
    const itens = doPeriodo.filter(l => l.autor_id === pessoa.userId && l.tipo === 'saida')
    return {
      userId: pessoa.userId,
      nome: pessoa.nome.split(' ')[0],
      iniciais: pessoa.iniciais,
      total: itens.reduce((s, l) => s + Number(l.valor), 0),
      itens: itens.map(l => ({
        esquerda: `${isoParaBR(l.data).slice(0, 5)} ${l.descricao} · ${l.categoria?.nome ?? 'sem categoria'}`,
        direita: fmt(l.valor).replace('R$ ', ''),
      })),
    }
  })

  // No consolidado cada lançamento carrega a obra de onde veio; no de uma obra só,
  // não carrega — e aí esta quebra sai vazia, que é o certo.
  const totalPorObra = new Map<string, ResumoObra>()
  doPeriodo.forEach(l => {
    if (!l.obra) return
    const atual = totalPorObra.get(l.obra.id) ?? { id: l.obra.id, nome: l.obra.nome, entradas: 0, saidas: 0 }
    if (l.tipo === 'entrada') atual.entradas += Number(l.valor)
    else atual.saidas += Number(l.valor)
    totalPorObra.set(l.obra.id, atual)
  })
  const porObra = [...totalPorObra.values()].sort((a, b) => b.saidas - a.saidas)

  return { titulo: janela.titulo, inicio: janela.inicio, fim: janela.fim, entradas, saidas, porCategoria, porPessoa, porObra }
}

// Recebe o nome pronto em vez da obra: no consolidado não existe uma obra só.
export function textoResumo(nome: string, relatorio: Relatorio, aberto: number): string {
  const linhas = [
    `*${nome}* — ${relatorio.titulo}`,
    `Entradas: ${fmt(relatorio.entradas)}`,
    `Saídas: ${fmt(relatorio.saidas)}`,
    `Em aberto: ${fmt(aberto)}`,
  ]

  if (relatorio.porObra.length > 1) {
    linhas.push('', 'Por obra:')
    relatorio.porObra.forEach(o => linhas.push(`${o.nome}: −${fmt(o.saidas)}`))
  }

  linhas.push('', ...relatorio.porPessoa.map(p => `${p.nome}: ${fmt(p.total)}`))
  return linhas.join('\n')
}
