import type { Lancamento, Membro, Repasse } from './types'
import { fmt } from './format'
import { mesDe, periodoDe, semanaDe } from './format'

export type Periodo = 'semana' | 'mes' | 'personalizado'

export type Intervalo = { inicio: string; fim: string }

// Uma saída como aparece no relatório: com data, o que foi, a categoria e, quando existe,
// a nota fiscal que a comprova.
export type ItemSaida = {
  id: string
  data: string
  descricao: string
  categoria: string
  valor: number
  comprovanteId: string | null
}

export type ResumoPessoa = {
  userId: string
  nome: string
  iniciais: string
  total: number
  itens: ItemSaida[]
}

export type ItemRepasse = {
  id: string
  data: string
  de: string
  para: string
  valor: number
  descricao: string | null
  obra: string | null
}

// Com quem o dinheiro está: o que a pessoa recebeu do cliente, menos o que gastou, mais o
// que recebeu de repasse, menos o que repassou. Acumulado até o fim do período — "com
// quem está" é uma foto do saldo, não o movimento de uma semana.
export type SaldoPessoa = {
  userId: string
  nome: string
  iniciais: string
  entradas: number
  saidas: number
  recebeu: number
  enviou: number
  emMaos: number
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
  // Repasses entre sócios no período. Não entram em entradas nem saídas.
  repassado: number
  repasses: ItemRepasse[]
  comCadaUm: SaldoPessoa[]
}

export function montarRelatorio(
  lancamentos: Lancamento[],
  membros: Membro[],
  periodo: Periodo,
  base = new Date(),
  intervalo?: Intervalo | null,
  repasses: Repasse[] = [],
): Relatorio {
  // Sem intervalo, 'personalizado' cai na semana em vez de quebrar: é o estado de quem
  // tocou na aba e ainda não escolheu as datas.
  const janela =
    periodo === 'personalizado' && intervalo
      ? periodoDe(intervalo.inicio, intervalo.fim)
      : periodo === 'mes'
        ? mesDe(base)
        : semanaDe(base)
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
      // Do mais antigo para o mais novo: lido de cima para baixo, é a ordem em que o
      // dinheiro saiu.
      itens: [...itens]
        .sort((a, b) => a.data.localeCompare(b.data) || a.created_at.localeCompare(b.created_at))
        .map(l => ({
          id: l.id,
          data: l.data,
          descricao: l.descricao,
          categoria: l.categoria?.nome ?? 'sem categoria',
          valor: Number(l.valor),
          comprovanteId: l.comprovante_id,
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

  // ---------------------------------------------------------------- repasses

  const primeiroNome = (p?: { nome: string } | null) => (p?.nome ?? 'alguém').split(' ')[0]
  const repassesDoPeriodo = repasses
    .filter(r => r.data >= janela.inicio && r.data <= janela.fim)
    .sort((a, b) => a.data.localeCompare(b.data) || a.created_at.localeCompare(b.created_at))
  const repassado = repassesDoPeriodo.reduce((s, r) => s + Number(r.valor), 0)

  // Quem entra no "com cada um": os mesmos da quebra por pessoa, mais quem aparece num
  // repasse — senão quem só recebeu repasse ficaria com dinheiro na mão e fora da conta.
  repasses.forEach(r => {
    for (const [id, perfil] of [[r.de_id, r.de], [r.para_id, r.para]] as const) {
      if (!pessoas.has(id)) pessoas.set(id, { userId: id, nome: perfil?.nome ?? 'alguém da equipe', iniciais: perfil?.iniciais ?? '··' })
    }
  })

  const ateOFim = lancamentos.filter(l => l.data <= janela.fim)
  const repassesAteOFim = repasses.filter(r => r.data <= janela.fim)
  const soma = (xs: { valor: number }[]) => xs.reduce((s, x) => s + Number(x.valor), 0)
  const comCadaUm = repasses.length
    ? [...pessoas.values()].map(p => {
        // Quem registrou a entrada é quem recebeu o dinheiro do cliente.
        const entradasP = soma(ateOFim.filter(l => l.tipo === 'entrada' && l.autor_id === p.userId))
        const saidasP = soma(ateOFim.filter(l => l.tipo === 'saida' && l.autor_id === p.userId))
        const recebeu = soma(repassesAteOFim.filter(r => r.para_id === p.userId))
        const enviou = soma(repassesAteOFim.filter(r => r.de_id === p.userId))
        return {
          userId: p.userId,
          nome: p.nome.split(' ')[0],
          iniciais: p.iniciais,
          entradas: entradasP,
          saidas: saidasP,
          recebeu,
          enviou,
          emMaos: entradasP - saidasP + recebeu - enviou,
        }
      })
    : []

  return {
    titulo: janela.titulo,
    inicio: janela.inicio,
    fim: janela.fim,
    entradas,
    saidas,
    porCategoria,
    porPessoa,
    porObra,
    repassado,
    repasses: repassesDoPeriodo.map(r => ({
      id: r.id,
      data: r.data,
      de: primeiroNome(r.de),
      para: primeiroNome(r.para),
      valor: Number(r.valor),
      descricao: r.descricao,
      obra: r.obra?.nome ?? null,
    })),
    comCadaUm,
  }
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

  if (relatorio.repasses.length) {
    linhas.push('', `Repassado no período: ${fmt(relatorio.repassado)}`)
    relatorio.repasses.forEach(r =>
      linhas.push(`${r.data.split('-').reverse().slice(0, 2).join('/')} ${r.de} → ${r.para}: ${fmt(r.valor)}`),
    )
  }
  if (relatorio.comCadaUm.length) {
    linhas.push('', 'Com cada um:')
    relatorio.comCadaUm.forEach(c => linhas.push(`${c.nome}: ${fmt(c.emMaos)}`))
  }
  return linhas.join('\n')
}
