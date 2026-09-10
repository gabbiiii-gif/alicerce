import { digitosParaValor, valorParaCampo } from '../lib/format'

type Props = {
  valor: number
  aoMudar: (valor: number) => void
  placeholder?: string
  style?: React.CSSProperties
  autoFocus?: boolean
}

// Digitação em centavos: o usuário só toca em números e o campo formata em reais.
export function MoedaInput({ valor, aoMudar, placeholder = 'R$ 0', style, autoFocus }: Props) {
  return (
    <input
      className="inp"
      inputMode="numeric"
      autoFocus={autoFocus}
      placeholder={placeholder}
      style={style}
      value={valor ? valorParaCampo(valor) : ''}
      onChange={e => aoMudar(digitosParaValor(e.target.value))}
    />
  )
}
