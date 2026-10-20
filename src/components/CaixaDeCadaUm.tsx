import { fmt } from '../lib/format'
import type { Relatorio } from '../lib/relatorio'

// O caixa de cada sócio e o acerto entre eles, em três linhas por pessoa: com quanto ficou,
// quanto gastou e quanto tem. Antes eram cinco números por pessoa, e o sócio pediu na
// reunião de 19/10/2026 "só o que é para mim e o que é para ele".
export function CaixaDeCadaUm({ relatorio, nota }: { relatorio: Relatorio; nota?: string }) {
  const { comCadaUm, acerto } = relatorio
  if (!comCadaUm.length) return null
  return (
    <>
      <div className="row" style={{ marginTop: 2 }}>
        <span style={{ fontSize: 15, fontWeight: 500, fontFamily: 'var(--fonte-titulo)' }}>Caixa de cada um</span>
        {nota && <span className="note">{nota}</span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
        {comCadaUm.map(c => (
          <div key={c.userId} className="cd" style={{ padding: 10, gap: 3 }}>
            <b style={{ fontSize: 14 }}>{c.nome}</b>
            <div className="row">
              <span className="note" style={{ fontSize: 11.5 }}>ficou com</span>
              <span className="num" style={{ fontSize: 12.5 }}>{fmt(c.ficou)}</span>
            </div>
            <div className="row">
              <span className="note" style={{ fontSize: 11.5 }}>gastou</span>
              <span className="num" style={{ fontSize: 12.5 }}>−{fmt(c.saidas)}</span>
            </div>
            <div className="row" style={{ borderTop: '1px solid #E1EAF6', paddingTop: 3 }}>
              <span className="note" style={{ fontSize: 11.5 }}>em caixa</span>
              <b className="num" style={{ fontSize: 15, color: c.emMaos < 0 ? '#9A3412' : '#0A2A6E' }}>
                {c.emMaos < 0 ? '−' : ''}{fmt(Math.abs(c.emMaos))}
              </b>
            </div>
          </div>
        ))}
      </div>

      {acerto && (
        <div className="cd" style={{ background: '#E0F4FF', borderColor: '#C4E4FB', gap: 4 }}>
          <div className="row">
            <span className="note" style={{ color: '#0A2A6E' }}>Resultado (entrou − saiu)</span>
            <b className="num" style={{ fontSize: 14 }}>{fmt(acerto.resultado)}</b>
          </div>
          <div className="row">
            <span className="note" style={{ color: '#0A2A6E' }}>Parte de cada um ({comCadaUm.length})</span>
            <b className="num" style={{ fontSize: 14 }}>{fmt(acerto.parte)}</b>
          </div>
          <div style={{ borderTop: '1px solid #C4E4FB', paddingTop: 5 }}>
            {acerto.transferencias.length ? (
              acerto.transferencias.map(t => (
                <div key={`${t.de}-${t.para}`} className="row">
                  <span style={{ fontSize: 14 }}>
                    <b>{t.de}</b> passa para <b>{t.para}</b>
                  </span>
                  <b className="num" style={{ fontSize: 15, color: '#0A2A6E' }}>{fmt(t.valor)}</b>
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
