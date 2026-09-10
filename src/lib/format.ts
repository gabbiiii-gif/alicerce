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
