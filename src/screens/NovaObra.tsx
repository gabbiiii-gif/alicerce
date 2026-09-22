import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { criarObra } from '../data/api'
import { useUsuario } from '../lib/auth'
import { useObraAtual } from '../lib/obraAtual'
import { usePlano } from '../lib/plano'
import { useAviso } from '../components/Toast'
import { fmt } from '../lib/format'
import { Tela } from '../components/Tela'
import { AvisoPlano } from '../components/AvisoPlano'
import { MoedaInput } from '../components/MoedaInput'

export function NovaObra() {
  const navigate = useNavigate()
  const { userId } = useUsuario()
  const { definir } = useObraAtual()
  const { vale } = usePlano()
  const avisar = useAviso()

  const [passo, setPasso] = useState(0)
  const [nome, setNome] = useState('')
  const [endereco, setEndereco] = useState('')
  const [valor, setValor] = useState(0)
  const [entrada, setEntrada] = useState(0)
  const [salvando, setSalvando] = useState(false)

  const aberto = Math.max(valor - entrada, 0)

  function voltar() {
    if (passo === 0) return navigate('/obras')
    setPasso(passo - 1)
  }

  async function avancar() {
    // Antes de tudo: a obra e a entrada dela são dois inserts, os dois barrados pela
    // policy sem plano. Deixar a pessoa preencher três passos para falhar no último é a
    // pior forma possível de contar que a assinatura venceu.
    if (!vale) {
      avisar('Seu plano venceu — assine para criar obras')
      return navigate('/plano')
    }
    if (passo === 0 && (!nome.trim() || valor <= 0)) return avisar('Falta nome e valor fechado')
    if (passo < 2) return setPasso(passo + 1)

    setSalvando(true)
    try {
      const obraId = await criarObra({ nome: nome.trim(), endereco: endereco.trim(), valorFechado: valor, entrada, autorId: userId })
      definir(obraId)
      avisar(entrada > 0 ? 'Obra criada com a entrada registrada' : 'Obra criada. Registre a entrada quando o cliente pagar')
      navigate(`/obra/${obraId}`, { replace: true })
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'não deu para criar a obra')
      setSalvando(false)
    }
  }

  const corPasso = (i: number) => (passo === i ? '#1B8FE8' : passo > i ? '#0A2A6E' : '#E4EDF8')

  return (
    <Tela titulo="Nova obra" voltar={voltar} acao={<span className="note">passo {passo + 1} de 3</span>}>
      <div className="row" style={{ gap: 5 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ flex: 1, height: 5, borderRadius: 3, background: corPasso(i) }} />
        ))}
      </div>

      <AvisoPlano />

      {passo === 0 && (
        <>
          <div style={{ fontSize: 19, fontWeight: 500, fontFamily: 'var(--fonte-titulo)', lineHeight: 1.1, marginTop: 4 }}>
            Do que se trata?
          </div>
          <input className="inp" placeholder="Nome da obra" value={nome} onChange={e => setNome(e.target.value)} autoFocus />
          <input className="inp" placeholder="Endereço" value={endereco} onChange={e => setEndereco(e.target.value)} />
          <div className="note">Valor fechado com o cliente</div>
          <MoedaInput valor={valor} aoMudar={setValor} />
        </>
      )}

      {passo === 1 && (
        <>
          <div style={{ fontSize: 19, fontWeight: 500, fontFamily: 'var(--fonte-titulo)', lineHeight: 1.1, marginTop: 4 }}>
            Quanto entrou
            <br />
            para começar?
          </div>
          <div className="note">
            {nome || 'obra sem nome'} · valor fechado {fmt(valor)}
          </div>
          <MoedaInput valor={entrada} aoMudar={setEntrada} style={{ fontSize: 23, textAlign: 'center', padding: '14px 9px' }} autoFocus />
          <div className="row" style={{ justifyContent: 'center', gap: 7 }}>
            {[10, 30, 50].map(pct => (
              <button key={pct} className="chip" onClick={() => setEntrada(Math.round(valor * (pct / 100)))}>
                {pct}%
              </button>
            ))}
          </div>
          {/* Cliente que ainda não pagou é comum: a obra começa assim mesmo, e a entrada vira
              um "+ entrada" normal no painel quando o dinheiro cair. */}
          <div className="ann">Cliente ainda não pagou? Deixe em R$ 0,00 e registre a entrada depois, no painel da obra.</div>
        </>
      )}

      {passo === 2 && (
        <>
          <div style={{ fontSize: 19, fontWeight: 500, fontFamily: 'var(--fonte-titulo)', lineHeight: 1.1, marginTop: 4 }}>
            Confere?
          </div>
          <div className="cd">
            <div className="row">
              <span className="note">Obra</span>
              <b style={{ fontSize: 14 }}>{nome || 'obra sem nome'}</b>
            </div>
            <div className="row">
              <span className="note">Valor fechado</span>
              <b style={{ fontSize: 14 }}>{fmt(valor)}</b>
            </div>
            <div className="row">
              <span className="note">Entrada</span>
              <b style={{ fontSize: 14 }}>{entrada > 0 ? fmt(entrada) : 'ainda não recebida'}</b>
            </div>
            <div className="row" style={{ borderTop: '1px solid #E1EAF6', paddingTop: 6 }}>
              <span style={{ fontSize: 14 }}>Fica em aberto</span>
              <span className="big">{fmt(aberto)}</span>
            </div>
          </div>
          <div className="ann">Aditivos entram depois, por fora deste valor.</div>
        </>
      )}

      <div className="row" style={{ marginTop: 'auto', gap: 8, paddingTop: 10 }}>
        <button className="bt" style={{ flex: 1 }} onClick={voltar}>
          Voltar
        </button>
        <button className="bt btp" style={{ flex: 2 }} onClick={avancar} disabled={salvando}>
          {passo === 2 ? (salvando ? 'criando…' : 'Criar obra') : 'Continuar'}
        </button>
      </div>
    </Tela>
  )
}
