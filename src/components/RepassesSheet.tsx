import { useEffect, useMemo, useState } from 'react'
import { apagarRepasse, criarRepasse, listarSocios } from '../data/api'
import { brParaISO, fmt, hojeISO, isoParaBR, semSimbolo } from '../lib/format'
import type { Membro, Profile, Repasse } from '../lib/types'
import { useAviso } from './Toast'
import { Sheet } from './Sheet'
import { MoedaInput } from './MoedaInput'

// Repasse: dinheiro que um sócio passa para o outro. Não é entrada nem saída — o total da
// obra não muda. Serve para o relatório dizer quanto foi repassado e com quem está o dinheiro.
export function RepassesSheet({
  obraId,
  userId,
  membros,
  repasses,
  podeLancar,
  aoFechar,
  aoMudar,
}: {
  obraId: string
  userId: string
  membros: Membro[]
  repasses: Repasse[]
  podeLancar: boolean
  aoFechar: () => void
  aoMudar: () => Promise<void> | void
}) {
  const avisar = useAviso()
  const [socios, setSocios] = useState<Profile[]>([])
  const [direcao, setDirecao] = useState<'enviei' | 'recebi'>('enviei')
  const [outroId, setOutroId] = useState<string | null>(null)
  const [valor, setValor] = useState(0)
  const [data, setData] = useState(isoParaBR(hojeISO()))
  const [descricao, setDescricao] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [removerId, setRemoverId] = useState<string | null>(null)

  // Sócio pode lançar na obra sem estar em obra_membros (0003), então a lista junta os dois.
  useEffect(() => {
    listarSocios().then(setSocios).catch(() => {})
  }, [])

  const pessoas = useMemo(() => {
    const mapa = new Map<string, Profile>()
    membros.forEach(m => mapa.set(m.user_id, m.profile))
    socios.forEach(s => mapa.set(s.id, s))
    mapa.delete(userId)
    return [...mapa.values()]
  }, [membros, socios, userId])

  // Com um sócio só — o caso comum — ele já vem escolhido.
  const outro = pessoas.find(p => p.id === outroId) ?? (pessoas.length === 1 ? pessoas[0] : null)
  const primeiro = (nome?: string) => (nome ?? '').split(' ')[0] || 'sócio'
  const total = repasses.reduce((s, r) => s + Number(r.valor), 0)

  async function salvar() {
    if (!outro) return avisar('Escolha com quem foi o repasse')
    if (valor <= 0) return avisar('Informe o valor do repasse')
    const dataISO = brParaISO(data)
    if (!dataISO) return avisar('Data no formato dia/mês/ano')
    setSalvando(true)
    try {
      await criarRepasse({
        obraId,
        autorId: userId,
        deId: direcao === 'enviei' ? userId : outro.id,
        paraId: direcao === 'enviei' ? outro.id : userId,
        valor,
        data: dataISO,
        descricao,
      })
      avisar('Repasse registrado')
      setValor(0)
      setDescricao('')
      await aoMudar()
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'não deu para registrar')
    } finally {
      setSalvando(false)
    }
  }

  async function remover(r: Repasse) {
    if (removerId !== r.id) return setRemoverId(r.id)
    try {
      await apagarRepasse(r.id)
      setRemoverId(null)
      avisar('Repasse apagado')
      await aoMudar()
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'não deu para apagar')
    }
  }

  const seg = (ativo: boolean) => ({
    flex: 1,
    padding: '6px 4px',
    border: 'none',
    cursor: 'pointer',
    background: ativo ? '#0A2A6E' : '#fff',
    color: ativo ? '#fff' : '#0A2A6E',
    fontFamily: 'var(--fonte-texto)',
    fontSize: 13.5,
  })

  return (
    <Sheet aoFechar={aoFechar}>
      <div className="row">
        <b style={{ fontSize: 17 }}>Repasse</b>
        <span className="note">não muda o total da obra</span>
      </div>

      {podeLancar ? (
        <>
          <div style={{ display: 'flex', border: '1px solid #C9D8EC', borderRadius: 10, overflow: 'hidden' }}>
            <button style={seg(direcao === 'enviei')} onClick={() => setDirecao('enviei')}>
              Eu enviei
            </button>
            <button style={seg(direcao === 'recebi')} onClick={() => setDirecao('recebi')}>
              Eu recebi
            </button>
          </div>

          {pessoas.length > 1 && (
            <div className="row" style={{ gap: 6, justifyContent: 'flex-start', flexWrap: 'wrap' }}>
              <span className="note">{direcao === 'enviei' ? 'para' : 'de'}</span>
              {pessoas.map(p => (
                <button
                  key={p.id}
                  className={outro?.id === p.id ? 'chip bta' : 'chip'}
                  style={outro?.id === p.id ? { background: '#1B8FE8', borderColor: '#1B8FE8' } : undefined}
                  onClick={() => setOutroId(p.id)}
                >
                  {primeiro(p.nome)}
                </button>
              ))}
            </div>
          )}
          {pessoas.length === 0 && <div className="ann">Nenhum sócio nesta obra ainda. Convide alguém em Equipe.</div>}

          <MoedaInput valor={valor} aoMudar={setValor} style={{ fontSize: 23, textAlign: 'center', padding: 10 }} />
          <div className="row" style={{ gap: 8 }}>
            <input
              className="inp"
              style={{ flex: 1 }}
              inputMode="numeric"
              placeholder="dd/mm/aaaa"
              value={data}
              onChange={e => setData(e.target.value)}
            />
            <input
              className="inp"
              style={{ flex: 2 }}
              placeholder="Observação (opcional)"
              value={descricao}
              onChange={e => setDescricao(e.target.value)}
            />
          </div>
          {outro && valor > 0 && (
            <div className="note" style={{ textAlign: 'center' }}>
              {direcao === 'enviei'
                ? `Você → ${primeiro(outro.nome)}: ${fmt(valor)}`
                : `${primeiro(outro.nome)} → você: ${fmt(valor)}`}
            </div>
          )}
          <button className="bt btp" onClick={salvar} disabled={salvando || !pessoas.length}>
            {salvando ? 'salvando…' : 'Registrar repasse'}
          </button>
        </>
      ) : (
        <div className="ann">Sem plano ativo não dá para registrar repasse.</div>
      )}

      {repasses.length > 0 && (
        <>
          <div className="row" style={{ marginTop: 4 }}>
            <b style={{ fontSize: 14 }}>Já repassado</b>
            <b className="num" style={{ fontSize: 14 }}>{fmt(total)}</b>
          </div>
          {repasses.map(r => (
            <div key={r.id} className="li" style={{ cursor: 'default' }}>
              <div style={{ minWidth: 0 }}>
                <b style={{ fontSize: 13.5 }}>
                  {(r.de_id === userId ? 'Você' : primeiro(r.de?.nome)) + ' → ' + (r.para_id === userId ? 'você' : primeiro(r.para?.nome))}
                </b>
                <div className="note">{[isoParaBR(r.data), r.descricao].filter(Boolean).join(' · ')}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <b className="num" style={{ fontSize: 13.5 }}>{semSimbolo(r.valor)}</b>
                {r.autor_id === userId && (
                  <button
                    className="chip"
                    onClick={() => remover(r)}
                    style={removerId === r.id ? { borderColor: '#FBD5B5', color: '#9A3412' } : undefined}
                  >
                    {removerId === r.id ? 'confirmar' : 'apagar'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </>
      )}

      <div className="note" style={{ textAlign: 'center', cursor: 'pointer' }} onClick={aoFechar}>
        fechar
      </div>
    </Sheet>
  )
}
