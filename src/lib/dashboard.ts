import type { Lancamento } from './types'
import type { ObraComContas } from '../data/api'

// Paleta dos gráficos.
//
// Não é a paleta do app: o app é monocromático azul, e azul-sobre-azul não separa
// séries para quem tem daltonismo. Estas cores foram validadas — banda de luminosidade,
// piso de croma, separação sob deuteranopia/protanopia/tritanopia e contraste contra o
// fundo. Recebido × gasto é polaridade, não identidade, então são dois hues opostos
// (frio e quente).
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
  // Acumulado até o fim deste mês: é o que mostra se a linha do gasto está encostando
  // na do recebido.
  recebidoAcum: number
  gastoAcum: number
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
  // Recebido menos gasto. Negativo significa que a obra está sendo tocada com dinheiro
  // que ainda não entrou — o número que decide se dá para seguir.
  margem: number
  contratado: number
  executadoPct: number
  obrasAtivas: number
  obrasEncerradas: number
  mesEntradas: number
  mesSaidas: number
  // Média de gasto dos meses que tiveram gasto, e quantos meses a margem cobre nesse
  // ritmo. É a pergunta prática: "o dinheiro em caixa dura até quando?"
  ritmoMensal: number
  mesesDeFolego: number | null
  meses: MesResumo[]
  categorias: FatiaCategoria[]
  ultimos: Lancamento[]
  maiorMes: number
  maiorAcum: number
}

// Os últimos `quantos` meses, incluindo os vazios.
//
// Um mês sem lançamento é informação — some da série se a gente montar a partir dos
// dados, e aí o gráfico mente sobre o ritmo da obra.
function ultimosMeses(quantos: number, base = new Date()) {
  const meses = []
  for (let i = quantos - 1; i >= 0; i--) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1)
    meses.push({
      chave: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      rotulo: MESES_CURTOS[d.getMonth()],
      entradas: 0,
      saidas: 0,
      recebidoAcum: 0,
      gastoAcum: 0,
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
  const contratado = obras.reduce((s, o) => s + o.contas.total, 0)
  const ativas = obras.filter(o => o.status !== 'encerrada')

  const meses = ultimosMeses(6, base)
  const porChave = new Map(meses.map(m => [m.chave, m]))
  const primeiroMes = meses[0].chave

  // Antes da janela: o acumulado começa de onde a obra já estava, senão a curva
  // recomeça do zero e finge que a obra nasceu há seis meses.
  let recebidoAcum = 0
  let gastoAcum = 0
  lancamentos.forEach(l => {
    if (l.data.slice(0, 7) >= primeiroMes) return
    if (l.tipo === 'entrada') recebidoAcum += Number(l.valor)
    else gastoAcum += Number(l.valor)
  })

  lancamentos.forEach(l => {
    const m = porChave.get(l.data.slice(0, 7))
    if (!m) return
    if (l.tipo === 'entrada') m.entradas += Number(l.valor)
    else m.saidas += Number(l.valor)
  })

  meses.forEach(m => {
    recebidoAcum += m.entradas
    gastoAcum += m.saidas
    m.recebidoAcum = recebidoAcum
    m.gastoAcum = gastoAcum
  })

  const mesAtual = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}`
  const doMes = lancamentos.filter(l => l.data.startsWith(mesAtual))

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

  const mesesComGasto = meses.filter(m => m.saidas > 0)
  const ritmoMensal = mesesComGasto.length
    ? mesesComGasto.reduce((s, m) => s + m.saidas, 0) / mesesComGasto.length
    : 0
  const margem = recebido - gasto

  return {
    aberto,
    recebido,
    gasto,
    margem,
    contratado,
    executadoPct: contratado ? Math.min(Math.round((gasto / contratado) * 100), 999) : 0,
    obrasAtivas: ativas.length,
    obrasEncerradas: obras.length - ativas.length,
    mesEntradas: doMes.filter(l => l.tipo === 'entrada').reduce((s, l) => s + Number(l.valor), 0),
    mesSaidas: doMes.filter(l => l.tipo === 'saida').reduce((s, l) => s + Number(l.valor), 0),
    ritmoMensal,
    // Sem gasto nenhum não há ritmo, e dividir por zero daria "infinitos meses de
    // fôlego", que é uma resposta pior do que não responder. Acima de 18 meses também
    // não se responde: o número vira "143,7 meses", que é verdade e não serve para nada
    // — ninguém planeja obra com doze anos de folga, e a precisão dá ares de previsão
    // que meia dúzia de lançamentos não sustenta.
    mesesDeFolego:
      ritmoMensal > 0 && margem > 0 && margem / ritmoMensal <= 18 ? margem / ritmoMensal : null,
    meses,
    categorias,
    ultimos: lancamentos.slice(0, 5),
    maiorMes: Math.max(1, ...meses.map(m => Math.max(m.entradas, m.saidas))),
    maiorAcum: Math.max(1, ...meses.map(m => Math.max(m.recebidoAcum, m.gastoAcum))),
  }
}
