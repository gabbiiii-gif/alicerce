// Tira a abertura do index.html da frente quando o app está pronto atrás dela.
//
// "Pronto" é a primeira tela de verdade montada — não um tempo fixo. Antes a abertura
// durava 1,8 s sempre, mesmo com tudo carregado em 200 ms; agora ela some assim que
// terminou de se desenhar e a tela de trás existe. Em rede ruim ela fica o quanto for
// preciso, cobrindo a espera no lugar de um spinner.

// O tempo da animação da marca (index.html): sair antes disso corta a barra no meio.
const MINIMO_MS = 700
// Quem pediu menos movimento não precisa esperar animação nenhuma.
const MINIMO_SUAVE_MS = 150
// A abertura espera as fontes do texto para a tela não aparecer primeiro numa letra e
// trocar de letra na frente da pessoa. Mas não espera para sempre: rede ruim não pode
// segurar o app inteiro por causa de tipografia.
const TETO_FONTES_MS = 900

let revelou = false

function esperar(ms: number) {
  return new Promise<void>(pronto => setTimeout(pronto, ms))
}

function fontesProntas(): Promise<unknown> {
  if (!('fonts' in document)) return Promise.resolve()
  const fontes = Promise.all([
    document.fonts.load('500 1em "Instrument Sans"'),
    document.fonts.load('400 1em "IBM Plex Sans"'),
  ]).catch(() => {})
  return Promise.race([fontes, esperar(TETO_FONTES_MS)])
}

// Depois que o navegador pintou o quadro atual — e não antes, como um efeito do React
// pode rodar.
function depoisDaPintura(tarefa: () => void) {
  requestAnimationFrame(() => setTimeout(tarefa, 0))
}

export function revelar() {
  if (revelou) return
  revelou = true

  const abertura = document.getElementById('abertura')
  const raiz = document.documentElement
  const suave = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  // performance.now() conta desde o início da navegação: o tempo que o JavaScript levou
  // para chegar já vale como tempo de abertura.
  const falta = Math.max(0, (suave ? MINIMO_SUAVE_MS : MINIMO_MS) - performance.now())

  depoisDaPintura(() => {
    // A primeira tela já está pintada (na letra de reserva, atrás da abertura): agora sim
    // as fontes do app, sem disputar a rede com ela. Ver `.fontes` em index.css.
    raiz.classList.add('fontes')
    if (!abertura) {
      raiz.classList.add('revelado')
      return
    }
    Promise.all([esperar(falta), fontesProntas()]).then(() => {
      requestAnimationFrame(() => {
        // `revelado` é o sinal para as animações de entrada da tela (a marca e o nome no
        // login): elas começam junto com a saída da abertura, e não escondidas atrás dela.
        raiz.classList.add('revelado')
        abertura.classList.add('saindo')
        const remover = () => abertura.remove()
        abertura.addEventListener('transitionend', remover, { once: true })
        // Garantia para quando o transitionend não vem (aba em segundo plano, por exemplo).
        setTimeout(remover, 600)
      })
    })
  })
}

// A abertura já saiu? A tela que monta atrás dela não precisa de animação de entrada —
// quem a apresenta é a própria saída da abertura. E, montando já no estado final, ela
// aparece mesmo antes de os recursos de animação (lib/movimento.ts) chegarem.
export function aberturaSaiu() {
  return document.documentElement.classList.contains('revelado')
}
