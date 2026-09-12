import { useId } from 'react'
import type { MesResumo } from '../lib/dashboard'
import { COR_ENTRADA, COR_SAIDA } from '../lib/dashboard'
import { curto } from '../lib/format'

type Props = {
  meses: MesResumo[]
  maior: number
}

// Recebido e gasto ACUMULADOS, mês a mês — a curva que um engenheiro de obra lê.
//
// A pergunta não é quanto entrou em julho: é se a linha do gasto está encostando na do
// recebido. Enquanto a faixa entre as duas é larga, a obra se paga; quando fecha, está
// sendo tocada com dinheiro que ainda não entrou.
//
// Linha, e não barra: acumulado é série temporal, e a inclinação é o próprio dado (o
// ritmo). Em 2D, e não em 3D: aqui o que importa é onde as curvas se cruzam, e
// profundidade só atrapalharia a leitura desse encontro.
export function CurvaAvanco({ meses, maior }: Props) {
  const id = useId()
  const L = 320
  const A = 132
  const padX = 8
  const padTopo = 14
  const padBaixo = 18

  if (meses.length < 2) return null

  const x = (i: number) => padX + (i * (L - padX * 2)) / (meses.length - 1)
  const y = (v: number) => padTopo + (1 - v / maior) * (A - padTopo - padBaixo)

  const linha = (pegar: (m: MesResumo) => number) =>
    meses.map((m, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(pegar(m)).toFixed(1)}`).join(' ')

  const area = (pegar: (m: MesResumo) => number) =>
    `${linha(pegar)} L ${x(meses.length - 1).toFixed(1)} ${y(0).toFixed(1)} L ${x(0).toFixed(1)} ${y(0).toFixed(1)} Z`

  const ultimo = meses[meses.length - 1]

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${L} ${A}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img"
           aria-label="Recebido e gasto acumulados nos últimos meses">
        <defs>
          <linearGradient id={`${id}-r`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COR_ENTRADA} stopOpacity="0.16" />
            <stop offset="100%" stopColor={COR_ENTRADA} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Base discreta: dá o chão sem virar grade que compete com as linhas. */}
        <line x1={padX} y1={y(0)} x2={L - padX} y2={y(0)} stroke="#E1EAF6" strokeWidth="1" />

        <path d={area(m => m.recebidoAcum)} fill={`url(#${id}-r)`} />
        <path d={linha(m => m.recebidoAcum)} fill="none" stroke={COR_ENTRADA} strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" />
        <path d={linha(m => m.gastoAcum)} fill="none" stroke={COR_SAIDA} strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" />

        {/* Só o ponto final ganha marcador: é o valor de hoje, o único que se lê exato.
            Um marcador em cada mês viraria ruído sobre a forma da curva. */}
        {([
          { v: ultimo.recebidoAcum, cor: COR_ENTRADA },
          { v: ultimo.gastoAcum, cor: COR_SAIDA },
        ]).map(p => (
          <circle key={p.cor} cx={x(meses.length - 1)} cy={y(p.v)} r="4.5" fill={p.cor}
                  stroke="#fff" strokeWidth="2" />
        ))}

        {meses.map((m, i) => (
          <text key={m.chave} x={x(i)} y={A - 4} textAnchor="middle" fontSize="9.5" fill="#8CA3BF"
                fontFamily="var(--fonte-dados)">
            {m.rotulo}
          </text>
        ))}
      </svg>

      {/* Os dois números de hoje, escritos: a curva mostra a tendência, o texto dá o
          valor — ninguém deve ter de medir a altura de um traço para saber quanto é. */}
      <div className="row" style={{ gap: 14, justifyContent: 'center', paddingTop: 2 }}>
        <span className="row" style={{ gap: 5, flex: 'none' }}>
          <i style={{ width: 9, height: 9, borderRadius: 2, background: COR_ENTRADA, display: 'block' }} />
          <span className="note">recebido <b className="num" style={{ color: COR_ENTRADA }}>{curto(ultimo.recebidoAcum)}</b></span>
        </span>
        <span className="row" style={{ gap: 5, flex: 'none' }}>
          <i style={{ width: 9, height: 9, borderRadius: 2, background: COR_SAIDA, display: 'block' }} />
          <span className="note">gasto <b className="num" style={{ color: COR_SAIDA }}>{curto(ultimo.gastoAcum)}</b></span>
        </span>
      </div>
    </div>
  )
}
