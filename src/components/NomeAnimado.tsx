import { useEffect, useRef } from 'react'
import { animate } from 'animejs/animation'
import { splitText } from 'animejs/text'
import { stagger } from 'animejs/utils'

// O nome da marca entrando letra a letra, na abertura do app.
//
// Os imports são por subpath de propósito: assim entra só o pedaço usado do Anime.js,
// e não a biblioteca inteira. Num app que roda em canteiro de obra, com sinal ruim e
// celular simples, cada dezena de kB conta.
export function NomeAnimado({ texto, className }: { texto: string; className?: string }) {
  const ref = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    // Quem pediu menos movimento no sistema vê o nome parado, e pronto.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let ativo = true
    let divisao: ReturnType<typeof splitText> | null = null

    // Dividir antes da fonte chegar mede as letras na fonte errada e a linha pula
    // quando a Instrument Sans finalmente carrega.
    document.fonts.ready.then(() => {
      if (!ativo) return
      // `accessible` mantém a palavra inteira para o leitor de tela, em vez de soletrar.
      divisao = splitText(el, { chars: true, accessible: true })
      animate(divisao.chars, {
        opacity: [0, 1],
        y: [24, 0],
        duration: 800,
        delay: stagger(60),
        ease: 'out(3)',
      })
    })

    return () => {
      ativo = false
      divisao?.revert()
    }
  }, [texto])

  return (
    <h1 ref={ref} className={className}>
      {texto}
    </h1>
  )
}
