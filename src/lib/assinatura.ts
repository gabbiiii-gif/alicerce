import type { Assinatura } from './types'

export function planoVale(a: Assinatura | null): boolean {
  if (!a?.vale_ate) return false
  // Mesma regra do plano_ativo() no banco (0013): Pix confirmado ou cortesia, dentro do prazo.
  return ['pix', 'cortesia'].includes(a.status) && new Date(a.vale_ate) > new Date()
}
