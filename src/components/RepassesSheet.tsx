import { useEffect, useMemo, useState } from 'react'
import { apagarRepasse, criarRepasse, listarSocios } from '../data/api'
import { brParaISO, fmt, hojeISO, isoParaBR } from '../lib/format'
import type { Membro, Profile, Repasse } from '../lib/types'
import { useAviso } from './Toast'
import { Sheet } from './Sheet'
import { MoedaInput } from './MoedaInput'
import { Secao } from './Tela'

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

  return (
    <Sheet aoFechar={aoFechar}>
      <div className="sheet-titulo">
        <b>Repasse</b>
        <span className="note">não muda o total da obra</span>
      </div>

      {podeLancar ? (
        <>
          <div className="seg" role="group" aria-label="Direção do repasse">
            <button className={direcao === 'enviei' ? 'on' : undefined} aria-pressed={direcao === 'enviei'} onClick={() => setDirecao('enviei')}>
              Eu enviei
            </button>
            <button className={direcao === 'recebi' ? 'on' : undefined} aria-pressed={direcao === 'recebi'} onClick={() => setDirecao('recebi')}>
              Eu recebi
            </button>
          </div>

          {pessoas.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span className="note" style={{ fontSize: 13 }}>{direcao === 'enviei' ? 'para' : 'de'}</span>
              {pessoas.map(p => (
                <button
                  key={p.id}
                  className={outro?.id === p.id ? 'chip on' : 'chip'}
                  aria-pressed={outro?.id === p.id}
                  onClick={() => setOutroId(p.id)}
                >
                  {primeiro(p.nome)}
                </button>
              ))}
            </div>
          )}
          {pessoas.length === 0 && <div className="ann">Nenhum sócio nesta obra ainda. Convide alguém em Equipe.</div>}

          <MoedaInput destaque rotulo="Valor do repasse" valor={valor} aoMudar={setValor} />
          {/* A data não encolhe abaixo do que "00/00/0000" ocupa: no celular estreito a
              observação é que cede espaço. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(128px, 1fr) 2fr', gap: 10 }}>
            <label className="rotulo">
              Data
              <input
                className="inp"
                inputMode="numeric"
                placeholder="dd/mm/aaaa"
                value={data}
                onChange={e => setData(e.target.value)}
              />
            </label>
            <label className="rotulo" style={{ minWidth: 0 }}>
              Observação
              <input
                className="inp"
                placeholder="opcional"
                value={descricao}
                onChange={e => setDescricao(e.target.value)}
              />
            </label>
          </div>
          {outro && valor > 0 && (
            <div className="note" style={{ textAlign: 'center', fontSize: 13 }}>
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
          <Secao
            titulo="Já repassado"
            nota={<span className="num" style={{ color: 'var(--navy)', fontWeight: 500 }}>{fmt(total)}</span>}
          />
          <div className="lista">
            {repasses.map(r => (
              <div key={r.id} className="linha">
                <span className="linha-txt">
                  {/* A folha fica fora do .scr, onde o negrito da base não chega. */}
                  <b style={{ fontFamily: 'var(--fonte-titulo)', fontWeight: 500, fontSize: 14 }}>
                    {(r.de_id === userId ? 'Você' : primeiro(r.de?.nome)) + ' → ' + (r.para_id === userId ? 'você' : primeiro(r.para?.nome))}
                  </b>
                  <span className="note">{[isoParaBR(r.data), r.descricao].filter(Boolean).join(' · ')}</span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
                  <span className="num" style={{ fontSize: 14, fontWeight: 500 }}>{fmt(r.valor)}</span>
                  {r.autor_id === userId && (
                    <button
                      className="chip"
                      onClick={() => remover(r)}
                      style={removerId === r.id ? { borderColor: 'var(--alerta-borda)', color: 'var(--alerta)' } : undefined}
                    >
                      {removerId === r.id ? 'confirmar' : 'apagar'}
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <button className="bt-texto" onClick={aoFechar}>fechar</button>
    </Sheet>
  )
}
