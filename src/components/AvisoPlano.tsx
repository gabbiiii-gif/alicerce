import { useNavigate } from 'react-router-dom'
import { usePlano } from '../lib/plano'
import { useUsuario } from '../lib/auth'
import { dataBR } from '../lib/format'

// A faixa que explica por que os botões estão desligados — ou que avisa antes de
// desligarem. Sem ela, quem perde o plano descobre isso preenchendo um lançamento
// inteiro para levar um erro de banco no fim, sem saber o que fazer a respeito.
//
// Some quando não há o que dizer: plano em dia e com folga não mostra nada.
export function AvisoPlano() {
  const navigate = useNavigate()
  const { userId } = useUsuario()
  const { plano, carregando, vale, diasRestantes } = usePlano()

  if (carregando) return null

  const assinatura = plano?.assinatura ?? null
  const ate = assinatura?.vale_ate ? dataBR(assinatura.vale_ate) : null
  const dias = diasRestantes ?? 0

  // Convidado nunca vê aviso de cobrança: o plano não é dele, e não há nada que ele possa
  // resolver. Se vencer, ele vê o app em leitura como todo mundo — e quem resolve é quem
  // assinou.
  const souTitular = !assinatura?.titular_id || assinatura.titular_id === userId

  let tom: 'parado' | 'atencao' | null = null
  let texto = ''
  let acao = 'Ver o plano'

  if (!vale) {
    tom = 'parado'
    texto = 'Sem plano ativo. Você continua vendo tudo, mas não dá para lançar.'
    acao = 'Pagar com Pix'
  } else if (dias <= 3) {
    // Sem renovação automática: se ninguém avisar, o prazo acaba no meio de um lançamento.
    tom = 'atencao'
    texto = dias <= 1 ? 'Seu plano termina hoje.' : `Seu plano termina em ${dias} dias, em ${ate}.`
    acao = 'Renovar'
  }

  if (!tom) return null
  if (!souTitular && tom === 'atencao') return null

  // A faixa laranja de `.ann-alerta` (fundo, borda e texto): é o mesmo âmbar do "Desfazer
  // sociedade" no Perfil, a cor que este app já usa para "atenção" — inventar outra só faria
  // a faixa parecer de outro produto. A pílula da ação herda a cor do texto.
  return (
    <button
      className="ann ann-alerta"
      onClick={() => navigate('/plano')}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        padding: '12px 14px',
        borderRadius: 14,
        textAlign: 'left',
        cursor: 'pointer',
        fontFamily: 'var(--fonte-texto)',
      }}
    >
      <b style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, lineHeight: 1.35 }}>{texto}</b>
      <span
        style={{
          flex: 'none',
          border: '1px solid var(--alerta-borda)',
          borderRadius: 999,
          padding: '6px 12px',
          fontSize: 12.5,
          whiteSpace: 'nowrap',
        }}
      >
        {acao}
      </span>
    </button>
  )
}
