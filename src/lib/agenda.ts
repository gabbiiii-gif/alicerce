// Quando fazer o trabalho que não é da primeira tela.

// Quando o celular estiver ocioso: a tela já assentou e ninguém está esperando.
export function quandoOcioso(tarefa: () => void, tetoMs = 2500) {
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(() => tarefa(), { timeout: tetoMs })
  } else {
    setTimeout(tarefa, 400)
  }
}

// No primeiro toque ou tecla, em qualquer lugar da tela. Para o que só serve a quem vai
// agir: o dedo encosta na tela bem antes do clique terminar, e esse intervalo já adianta
// o download.
export function aoInteragir(tarefa: () => void) {
  const eventos = ['pointerdown', 'keydown', 'touchstart'] as const
  const uma = () => {
    eventos.forEach(e => window.removeEventListener(e, uma, true))
    tarefa()
  }
  eventos.forEach(e => window.addEventListener(e, uma, { capture: true, passive: true }))
  return () => eventos.forEach(e => window.removeEventListener(e, uma, true))
}
