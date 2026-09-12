import type { Transition, Variants } from 'motion/react'

// Vocabulário de movimento do Alicerce, num lugar só. Se um dia o app inteiro tiver
// que ficar mais rápido ou mais lento, muda aqui.

// A curva do protótipo, a mesma que a folha usava no CSS.
export const CURVA: Transition = { duration: 0.2, ease: [0.22, 0.8, 0.3, 1] }

// Troca de tela: a nova entra pela direita enquanto a anterior sai pela esquerda.
// As telas são `position: absolute`, então as duas se sobrepõem sem empurrar nada.
export const TELA: Variants = {
  entra: { opacity: 0, x: 12 },
  parada: { opacity: 1, x: 0 },
  sai: { opacity: 0, x: -8 },
}

// Listas: os itens aparecem em cascata em vez de todos de uma vez.
export const LISTA: Variants = {
  parada: { transition: { staggerChildren: 0.035 } },
}

export const ITEM: Variants = {
  entra: { opacity: 0, y: 8 },
  parada: { opacity: 1, y: 0, transition: CURVA },
}
