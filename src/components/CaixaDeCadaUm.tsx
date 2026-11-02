import { fmt } from '../lib/format'
import type { Relatorio } from '../lib/relatorio'
import { Secao } from './Tela'

// O caixa de cada sócio e o acerto entre eles, em três linhas por pessoa: com quanto ficou,
// quanto gastou e quanto tem. Antes eram cinco números por pessoa, e o sócio pediu na
// reunião de 19/10/2026 "só o que é para mim e o que é para ele".
// Com centavos, "R$ 200.620,35" não cabe ao lado do rótulo no cartão de meia largura do
// celular. Em vez de partir o valor no meio ("R$" numa linha, o número na outra), a linha
// quebra inteira: o rótulo fica em cima e o valor desce, alinhado à direita.
const LINHA = { gap: '0 6px', flexWrap: 'wrap' } as const
const INTEIRO = { whiteSpace: 'nowrap', marginLeft: 'auto' } as const

export function CaixaDeCadaUm({ relatorio, nota }: { relatorio: Relatorio; nota?: string }) {
  const { comCadaUm, acerto } = relatorio
  if (!comCadaUm.length) return null
  return (
    <>
      <Secao titulo="Caixa de cada um" nota={nota} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, flex: 'none' }}>
        {comCadaUm.map(c => (
          <div key={c.userId} className="cd" style={{ gap: 5, minWidth: 0 }}>
            <b style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nome}</b>
            <div className="row" style={LINHA}>
              <span className="note" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>ficou com</span>
              <span className="num" style={{ fontSize: 12.5, ...INTEIRO }}>{fmt(c.ficou)}</span>
            </div>
            <div className="row" style={LINHA}>
              <span className="note" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>gastou</span>
              <span className="num" style={{ fontSize: 12.5, ...INTEIRO }}>−{fmt(c.saidas)}</span>
            </div>
            <div className="row" style={{ ...LINHA, alignItems: 'baseline', borderTop: '1px solid var(--linha)', paddingTop: 6 }}>
              <span className="note" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>em caixa</span>
              {/* Caixa negativo (gastou mais do que ficou com ele) sai em laranja: é o
                  sócio que está bancando a obra do próprio bolso. */}
              <span className="num" style={{ fontSize: 16, fontWeight: 500, ...INTEIRO, color: c.emMaos < 0 ? 'var(--alerta)' : 'var(--navy)' }}>
                {c.emMaos < 0 ? '−' : ''}{fmt(Math.abs(c.emMaos))}
              </span>
            </div>
          </div>
        ))}
      </div>

      {acerto && (
        <div className="cd" style={{ background: 'var(--azul-claro)', borderColor: '#C4E4FB', boxShadow: 'none' }}>
          <div className="row">
            <span style={{ fontSize: 13, color: 'var(--navy-700)' }}>Resultado (entrou − saiu)</span>
            <span className="num" style={{ fontSize: 14, fontWeight: 500 }}>{fmt(acerto.resultado)}</span>
          </div>
          <div className="row">
            <span style={{ fontSize: 13, color: 'var(--navy-700)' }}>Parte de cada um ({comCadaUm.length})</span>
            <span className="num" style={{ fontSize: 14, fontWeight: 500 }}>{fmt(acerto.parte)}</span>
          </div>
          <div style={{ borderTop: '1px solid #C4E4FB', paddingTop: 7, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {acerto.transferencias.length ? (
              acerto.transferencias.map(t => (
                <div key={`${t.de}-${t.para}`} className="row" style={{ alignItems: 'baseline' }}>
                  <span style={{ fontSize: 14 }}>
                    <b style={{ fontWeight: 600 }}>{t.de}</b> passa para <b style={{ fontWeight: 600 }}>{t.para}</b>
                  </span>
                  <span className="num" style={{ fontSize: 16, fontWeight: 500, flex: 'none' }}>{fmt(t.valor)}</span>
                </div>
              ))
            ) : (
              <span style={{ fontSize: 14 }}>Contas acertadas: ninguém deve nada.</span>
            )}
          </div>
        </div>
      )}
      <div className="note">
        Entrada conta no caixa de quem recebeu o dinheiro. Repasse só muda o dinheiro de mão.
      </div>
    </>
  )
}
