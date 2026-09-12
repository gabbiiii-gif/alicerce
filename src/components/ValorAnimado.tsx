import { useEffect, useRef } from 'react'
import { animate } from 'animejs/animation'

type Props = {
  valor: number
  formatar: (n: number) => string
  className?: string
  style?: React.CSSProperties
}

// Dinheiro que conta até o valor em vez de aparecer pronto. Vale no painel da obra,
// onde o número é a informação principal da tela e a contagem faz o olho pousar nele.
//
// Escreve direto no nó do DOM: passar por estado do React seria um render por quadro,
// uns quarenta por segundo, para trocar um texto.
export function ValorAnimado({ valor, formatar, className, style }: Props) {
  const ref = useRef<HTMLSpanElement>(null)
  const anterior = useRef(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const de = anterior.current
    anterior.current = valor

    if (de === valor || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.textContent = formatar(valor)
      return
    }

    const conta = { n: de }
    const animacao = animate(conta, {
      n: valor,
      duration: 700,
      ease: 'out(3)',
      onUpdate: () => {
        el.textContent = formatar(conta.n)
      },
    })

    return () => {
      animacao.pause()
    }
  }, [valor, formatar])

  // O valor já formatado fica no HTML inicial: sem JS, ou antes do efeito rodar,
  // a tela mostra o número certo em vez de um espaço vazio.
  return (
    <span ref={ref} className={className} style={style}>
      {formatar(valor)}
    </span>
  )
}
