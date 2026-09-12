import type { Lancamento } from './types'
import type { ObraComContas } from '../data/api'

// Paleta dos gráficos.
//
// Não é a paleta do app: o app é monocromático azul, e azul-sobre-azul não separa
// categorias para quem tem daltonismo. Estas cores foram validadas — banda de
// luminosidade, piso de croma, separação sob deuteranopia/protanopia/tritanopia e
// contraste contra o fundo. Azul e âmbar são pares quente/frio para entrada × saída,
// que é polaridade e não identidade.
export const COR_ENTRADA = '#1B8FE8'
export const COR_SAIDA = '#D97706'

// Ordem fixa: uma categoria mantém a cor mesmo que outra suma do período. Cor segue a
// coisa, nunca a posição dela na lista.
export const CORES_CATEGORIA = ['#1B8FE8', '#F59E0B', '#10B981', '#8B5CF6', '#EC4899']
export const COR_OUTRAS = '#94A3B8'

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

export type MesResumo = {
  chave: string
  rotulo: string
  entradas: number
  saidas: number
}

export type FatiaCategoria = {
  nome: string
  valor: number
  pct: number
  cor: string
}

export type Visao = {
  aberto: number
  recebido: number
  gasto: number
  obrasAtivas: number
  obrasEncerradas: number
  mesEntradas: number
  mesSaidas: number
  meses: MesResumo[]
  categorias: FatiaCategoria[]
  ultimos: Lancamento[]
  maiorMes: number
}

// Os últimos `quantos` meses, incluindo os vazios.
//
// Um mês sem lançamento é informação — some da série se a gente montar a partir dos
// dados, e aí o gráfico mente sobre o ritmo da obra.
function ultimosMeses(quantos: number, base = new Date()): MesResumo[] {
  const meses: MesResumo[] = []
  for (let i = quantos - 1; i >= 0; i--) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1)
    meses.push({
      chave: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      rotulo: MESES_CURTOS[d.getMonth()],
      entradas: 0,
      saidas: 0,
    })
  }
  return meses
}

export function montarVisao(
  obras: ObraComContas[],
  lancamentos: Lancamento[],
  base = new Date(),
): Visao {
  const aberto = obras.reduce((s, o) => s + o.contas.aberto, 0)
  const recebido = obras.reduce((s, o) => s + o.contas.recebido, 0)
  const gasto = obras.reduce((s, o) => s + o.contas.saidas, 0)

  const meses = ultimosMeses(6, base)
  const porChave = new Map(meses.map(m => [m.chave, m]))
  lancamentos.forEach(l => {
    const m = porChave.get(l.data.slice(0, 7))
    if (!m) return
    if (l.tipo === 'entrada') m.entradas += Number(l.valor)
    else m.saidas += Number(l.valor)
  })

  const mesAtual = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}`
  const doMes = lancamentos.filter(l => l.data.startsWith(mesAtual))

  // Categorias do mês, maiores primeiro. Da sexta em diante vira "Outras": passar disso
  // são cores demais carregando significado, e ninguém distingue nove fatias.
  const soma = new Map<string, number>()
  doMes
    .filter(l => l.tipo === 'saida')
    .forEach(l => {
      const nome = l.categoria?.nome ?? 'Sem categoria'
      soma.set(nome, (soma.get(nome) ?? 0) + Number(l.valor))
    })
  const ordenadas = [...soma.entries()].sort((a, b) => b[1] - a[1])
  const principais = ordenadas.slice(0, CORES_CATEGORIA.length)
  const resto = ordenadas.slice(CORES_CATEGORIA.length).reduce((s, [, v]) => s + v, 0)
  const totalMes = ordenadas.reduce((s, [, v]) => s + v, 0)

  const categorias: FatiaCategoria[] = principais.map(([nome, valor], i) => ({
    nome,
    valor,
    pct: totalMes ? Math.round((valor / totalMes) * 100) : 0,
    cor: CORES_CATEGORIA[i],
  }))
  if (resto > 0) {
    categorias.push({
      nome: 'Outras',
      valor: resto,
      pct: totalMes ? Math.round((resto / totalMes) * 100) : 0,
      cor: COR_OUTRAS,
    })
  }

  return {
    aberto,
    recebido,
    gasto,
    obrasAtivas: obras.filter(o => o.status !== 'encerrada').length,
    obrasEncerradas: obras.filter(o => o.status === 'encerrada').length,
    mesEntradas: doMes.filter(l => l.tipo === 'entrada').reduce((s, l) => s + Number(l.valor), 0),
    mesSaidas: doMes.filter(l => l.tipo === 'saida').reduce((s, l) => s + Number(l.valor), 0),
    meses,
    categorias,
    ultimos: lancamentos.slice(0, 5),
    // A escala das barras sai do maior valor da série inteira, não de cada mês: é o que
    // faz as alturas serem comparáveis entre si.
    maiorMes: Math.max(1, ...meses.map(m => Math.max(m.entradas, m.saidas))),
  }
}
