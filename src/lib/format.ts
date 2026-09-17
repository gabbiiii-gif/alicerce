// Primeira letra maiúscula no que a pessoa escreveu.
//
// Nome de obra, categoria e descrição são digitados no celular, correndo, muitas vezes em
// campo com teclado que não capitaliza. Depois esse texto aparece como título na lista,
// no relatório e no PDF que vai para o cliente — e "roberto" no cabeçalho de um documento
// parece descuido de quem mandou, não de quem digitou.
//
// Só a primeira letra: o resto é como a pessoa escreveu. Mexer no meio estragaria siglas
// e nomes compostos — "Depósito São João" não pode virar "Depósito são joão".
export function comoNome(texto: string): string {
  const limpo = texto.trim()
  if (!limpo) return limpo
  return limpo.charAt(0).toUpperCase() + limpo.slice(1)
}

export function fmt(valor: number | null | undefined): string {
  return 'R$ ' + Math.round(valor || 0).toLocaleString('pt-BR')
}

export function semSimbolo(valor: number | null | undefined): string {
  return Math.round(valor || 0).toLocaleString('pt-BR')
}

// Valores curtos para barras e resumos: 4500 -> "4k"
export function curto(valor: number | null | undefined): string {
  const v = Math.round(valor || 0)
  return v >= 1000 ? Math.round(v / 1000) + 'k' : String(v)
}

// Entrada de dinheiro no celular: o usuário digita só dígitos e o campo formata.
export function digitosParaValor(digitos: string): number {
  const limpo = digitos.replace(/\D/g, '')
  return limpo ? Number(limpo) / 100 : 0
}

export function valorParaCampo(valor: number): string {
  if (!valor) return ''
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })
}

export function mascaraMoeda(texto: string): string {
  return valorParaCampo(digitosParaValor(texto))
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

export function dataCurta(iso: string): string {
  const [, mes, dia] = iso.split('-')
  return `${dia}/${mes}`
}

export function hojeISO(): string {
  const d = new Date()
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}

export function isoParaBR(iso: string): string {
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

export function brParaISO(br: string): string | null {
  const m = br.trim().match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/)
  if (!m) return null
  const ano = m[3] ? (m[3].length === 2 ? '20' + m[3] : m[3]) : String(new Date().getFullYear())
  return `${ano}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

// Intervalo escolhido à mão, de ponta a ponta.
//
// Diferente de semanaDe e mesDe, aqui as duas pontas vêm da pessoa — e vêm trocadas com
// frequência, porque digitar "de 20 a 14" é erro fácil. Ordenar em vez de recusar devolve
// o relatório que ela quis pedir; recusar devolveria um período vazio, que parece obra sem
// lançamento em vez de data invertida.
export function periodoDe(a: string, b: string): { inicio: string; fim: string; titulo: string } {
  const [inicio, fim] = a <= b ? [a, b] : [b, a]
  const mesmoAno = inicio.slice(0, 4) === fim.slice(0, 4)
  const titulo =
    inicio === fim
      ? isoParaBR(inicio)
      : mesmoAno
        ? `${dataCurta(inicio)} – ${dataCurta(fim)}`
        : `${isoParaBR(inicio)} – ${isoParaBR(fim)}`
  return { inicio, fim, titulo }
}

// Semana de segunda a domingo que contém a data.
export function semanaDe(base: Date): { inicio: string; fim: string; titulo: string } {
  const d = new Date(base)
  const diaSemana = (d.getDay() + 6) % 7
  const inicio = new Date(d)
  inicio.setDate(d.getDate() - diaSemana)
  const fim = new Date(inicio)
  fim.setDate(inicio.getDate() + 6)
  const iso = (x: Date) => [x.getFullYear(), String(x.getMonth() + 1).padStart(2, '0'), String(x.getDate()).padStart(2, '0')].join('-')
  const titulo = `${String(inicio.getDate()).padStart(2, '0')} – ${String(fim.getDate()).padStart(2, '0')} ${MESES[fim.getMonth()]}`
  return { inicio: iso(inicio), fim: iso(fim), titulo }
}

export function mesDe(base: Date): { inicio: string; fim: string; titulo: string } {
  const inicio = new Date(base.getFullYear(), base.getMonth(), 1)
  const fim = new Date(base.getFullYear(), base.getMonth() + 1, 0)
  const iso = (x: Date) => [x.getFullYear(), String(x.getMonth() + 1).padStart(2, '0'), String(x.getDate()).padStart(2, '0')].join('-')
  const titulo = MESES[base.getMonth()].charAt(0).toUpperCase() + MESES[base.getMonth()].slice(1)
  return { inicio: iso(inicio), fim: iso(fim), titulo }
}
