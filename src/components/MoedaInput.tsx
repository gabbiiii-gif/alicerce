import { digitosParaValor, valorParaCampo } from '../lib/format'

type Props = {
  id?: string
  valor: number
  aoMudar: (valor: number) => void
  placeholder?: string
  style?: React.CSSProperties
  autoFocus?: boolean
  // O número grande no meio (.inp-valor), quando o valor é o assunto da folha: entrada,
  // aditivo, repasse. Num formulário com outros campos ele fica do tamanho dos vizinhos.
  destaque?: boolean
  // Nome para o leitor de tela quando não há <label> apontando para o campo.
  rotulo?: string
}

// Digitação em centavos: o usuário só toca em números e o campo formata em reais.
export function MoedaInput({ id, valor, aoMudar, placeholder = 'R$ 0', style, autoFocus, destaque, rotulo }: Props) {
  return (
    <input
      id={id}
      className={destaque ? 'inp inp-valor' : 'inp'}
      inputMode="numeric"
      autoFocus={autoFocus}
      placeholder={placeholder}
      aria-label={rotulo}
      style={style}
      value={valor ? valorParaCampo(valor) : ''}
      onChange={e => aoMudar(digitosParaValor(e.target.value))}
    />
  )
}
