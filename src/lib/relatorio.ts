import type { Lancamento, Membro, Obra } from './types'
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

export type Relatorio = {
  titulo: string
  inicio: string
  fim: string
  entradas: number
  saidas: number
  porCategoria: { nome: string; valor: number; pct: number }[]
  porPessoa: ResumoPessoa[]
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

  const porPessoa = membros.map(m => {
    const itens = doPeriodo.filter(l => l.autor_id === m.user_id && l.tipo === 'saida')
    return {
      userId: m.user_id,
      nome: m.profile.nome.split(' ')[0],
      iniciais: m.profile.iniciais,
      total: itens.reduce((s, l) => s + Number(l.valor), 0),
      itens: itens.map(l => ({
        esquerda: `${isoParaBR(l.data).slice(0, 5)} ${l.descricao} · ${l.categoria?.nome ?? 'sem categoria'}`,
        direita: fmt(l.valor).replace('R$ ', ''),
      })),
    }
  })

  return { titulo: janela.titulo, inicio: janela.inicio, fim: janela.fim, entradas, saidas, porCategoria, porPessoa }
}

export function textoResumo(obra: Obra, relatorio: Relatorio, aberto: number): string {
  const linhas = [
    `*${obra.nome}* — ${relatorio.titulo}`,
    `Entradas: ${fmt(relatorio.entradas)}`,
    `Saídas: ${fmt(relatorio.saidas)}`,
    `Em aberto: ${fmt(aberto)}`,
    '',
    ...relatorio.porPessoa.map(p => `${p.nome}: ${fmt(p.total)}`),
  ]
  return linhas.join('\n')
}
