import type { Lancamento, Membro, Profile, Repasse } from './types'
import { fmt } from './format'
import { hojeISO, mesDe, periodoDe, semanaDe } from './format'

// 'obra': do primeiro lançamento até hoje. É o padrão: o que o sócio quer saber é quanto a
// obra deu e quanto cada um gastou nela, não o movimento da semana (reunião de 19/10/2026).
export type Periodo = 'obra' | 'semana' | 'mes' | 'personalizado'

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
  // O que ficou com a pessoa: entradas no nome dela, mais repasse recebido, menos repassado.
  ficou: number
  emMaos: number
}

// Fechamento entre os sócios: cada um com uma parte igual do resultado, e quem passa quanto
// a quem para chegar lá.
export type Acerto = {
  resultado: number
  parte: number
  transferencias: { de: string; para: string; valor: number }[]
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
  // Nulo com uma pessoa só.
  acerto: Acerto | null
}

// Tudo o que já foi lançado. O fim é o último lançamento quando ele cai depois de hoje
// (nota com data adiantada também entra na conta).
function obraToda(lancamentos: Lancamento[], repasses: Repasse[]) {
  const hoje = hojeISO()
  const datas = [...lancamentos.map(l => l.data), ...repasses.map(r => r.data)].sort()
  const inicio = datas[0] ?? hoje
  const fim = datas.length && datas[datas.length - 1] > hoje ? datas[datas.length - 1] : hoje
  return { inicio, fim, titulo: 'Do início até hoje' }
}

export function montarRelatorio(
  lancamentos: Lancamento[],
  membros: Membro[],
  periodo: Periodo,
  base = new Date(),
  intervalo?: Intervalo | null,
  repasses: Repasse[] = [],
  // Os sócios do grupo (listarSocios). Sócio vê e lança na obra sem estar em obra_membros
  // (0003): sem esta lista, quem ainda não lançou nada ficava fora da divisão e o acerto
  // dava o resultado inteiro para o outro.
  socios: Profile[] = [],
): Relatorio {
  // Sem intervalo, 'personalizado' cai na semana em vez de quebrar: é o estado de quem
  // tocou na aba e ainda não escolheu as datas.
  const janela =
    periodo === 'obra'
      ? obraToda(lancamentos, repasses)
      : periodo === 'personalizado' && intervalo
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

  // O dinheiro da entrada é de quem recebeu, não de quem digitou (0020). Entrada antiga, sem
  // essa marca, fica com quem lançou.
  const dono = (l: Lancamento) => (l.tipo === 'entrada' ? l.recebido_por ?? l.autor_id : l.autor_id)

  // Quem tem caixa na obra: os sócios, mesmo sem lançamento, e quem só recebeu entrada ou
  // lançou antes do período.
  socios.forEach(s => {
    const atual = pessoas.get(s.id)
    // O perfil do sócio tem o nome de verdade; o que veio antes pode ser o rótulo genérico.
    if (!atual || atual.nome === 'alguém da equipe') pessoas.set(s.id, { userId: s.id, nome: s.nome, iniciais: s.iniciais })
  })
  ateOFim.forEach(l => {
    const id = dono(l)
    if (pessoas.has(id)) return
    const perfil = id === l.autor_id ? l.autor : null
    pessoas.set(id, { userId: id, nome: perfil?.nome ?? 'sócio', iniciais: perfil?.iniciais ?? '··' })
  })

  const caixas = [...pessoas.values()].map(p => {
    const entradasP = soma(ateOFim.filter(l => l.tipo === 'entrada' && dono(l) === p.userId))
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
      ficou: entradasP + recebeu - enviou,
      emMaos: entradasP - saidasP + recebeu - enviou,
    }
  })
  // Com uma pessoa só não há caixa a separar nem acerto a fazer.
  const comCadaUm = caixas.length > 1 ? caixas : []

  // Acerto: o resultado da obra (o que entrou menos o que saiu) dividido em partes iguais.
  // Cada um deveria terminar com a própria parte em mãos; quem tem mais, passa a diferença a
  // quem tem menos. Usa o dinheiro que entrou, não o contrato: com saldo a receber, a parte
  // que ainda não chegou não está no caixa de ninguém.
  let acerto: Acerto | null = null
  if (comCadaUm.length) {
    // Em centavos inteiros: somar reais em ponto flutuante deixa sobras de 0,0000001 que
    // viravam um Pix de R$ 0,00 no acerto. Diferença de menos de um centavo não é dívida.
    const emCentavos = (v: number) => Math.round(Number(v) * 100)
    const resultadoC = soma(ateOFim.filter(l => l.tipo === 'entrada')) - soma(ateOFim.filter(l => l.tipo === 'saida'))
    const resultado = emCentavos(resultadoC) / 100
    const parteC = emCentavos(resultadoC) / comCadaUm.length
    const devem = comCadaUm.map(c => ({ nome: c.nome, sobra: emCentavos(c.emMaos) - parteC })).filter(c => c.sobra > 0.5)
    const recebem = comCadaUm.map(c => ({ nome: c.nome, falta: parteC - emCentavos(c.emMaos) })).filter(c => c.falta > 0.5)
    const transferencias: Acerto['transferencias'] = []
    // Quem mais deve paga primeiro a quem mais tem a receber: o menor número de Pix.
    devem.sort((a, b) => b.sobra - a.sobra)
    recebem.sort((a, b) => b.falta - a.falta)
    for (const d of devem) {
      for (const r of recebem) {
        if (d.sobra <= 0.5) break
        if (r.falta <= 0.5) continue
        const centavos = Math.round(Math.min(d.sobra, r.falta))
        transferencias.push({ de: d.nome, para: r.nome, valor: centavos / 100 })
        d.sobra -= centavos
        r.falta -= centavos
      }
    }
    acerto = { resultado, parte: parteC / 100, transferencias }
  }

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
    acerto,
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
    linhas.push('', 'Caixa de cada um:')
    relatorio.comCadaUm.forEach(c =>
      linhas.push(`${c.nome}: ficou com ${fmt(c.ficou)}, gastou ${fmt(c.saidas)}, em caixa ${fmt(c.emMaos)}`),
    )
  }
  if (relatorio.acerto) {
    linhas.push('', `Resultado: ${fmt(relatorio.acerto.resultado)} (${fmt(relatorio.acerto.parte)} para cada)`)
    if (relatorio.acerto.transferencias.length) {
      relatorio.acerto.transferencias.forEach(t => linhas.push(`Acerto: ${t.de} passa ${fmt(t.valor)} para ${t.para}`))
    } else {
      linhas.push('Acerto: ninguém deve nada')
    }
  }
  return linhas.join('\n')
}
