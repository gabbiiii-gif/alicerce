import { useState, type CSSProperties } from 'react'
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

  const corPasso = (i: number) => (passo === i ? 'var(--azul)' : passo > i ? 'var(--navy)' : 'var(--borda-nav)')
  const nomeExibido = nome.trim() || 'obra sem nome'

  return (
    <Tela
      titulo="Nova obra"
      voltar={voltar}
      acao={<span className="note" style={{ fontSize: 13, flex: 'none' }}>passo {passo + 1} de 3</span>}
    >
      <div className="row" style={{ gap: 6, flex: 'none' }} aria-hidden="true">
        {[0, 1, 2].map(i => (
          <i key={i} style={{ flex: 1, height: 5, borderRadius: 3, background: corPasso(i), display: 'block' }} />
        ))}
      </div>

      <AvisoPlano />

      {passo === 0 && (
        <>
          <h2 style={TITULO}>Do que se trata?</h2>
          <label className="rotulo">
            Nome da obra
            <input className="inp" placeholder="Casa Vila Mariana" value={nome} onChange={e => setNome(e.target.value)} autoFocus />
          </label>
          <label className="rotulo">
            Endereço
            <input className="inp" placeholder="Rua, número e bairro" value={endereco} onChange={e => setEndereco(e.target.value)} />
          </label>
          <label className="rotulo">
            Valor fechado com o cliente
            <MoedaInput
              valor={valor}
              aoMudar={setValor}
              placeholder="R$ 0,00"
              style={{ minHeight: 56, fontSize: 22, fontFamily: 'var(--fonte-dados)', letterSpacing: '-.02em' }}
            />
          </label>
        </>
      )}

      {passo === 1 && (
        <>
          <h2 style={{ ...TITULO, margin: '8px 0 0' }}>
            Quanto entrou
            <br />
            para começar?
          </h2>
          <span className="note" style={{ fontSize: 13 }}>
            {nomeExibido} · valor fechado {fmt(valor)}
          </span>
          <MoedaInput
            valor={entrada}
            aoMudar={setEntrada}
            placeholder="R$ 0,00"
            style={{
              minHeight: 72,
              borderRadius: 14,
              marginTop: 4,
              textAlign: 'center',
              fontFamily: 'var(--fonte-dados)',
              fontSize: 30,
              letterSpacing: '-.02em',
            }}
            autoFocus
          />
          <div className="row" style={{ justifyContent: 'center', gap: 8 }}>
            {[10, 20, 30, 50].map(pct => {
              const doPct = Math.round(valor * pct) / 100
              // Marcado enquanto a entrada for exatamente aquele percentual; digitar outro
              // valor desmarca, e fica claro que o número já não é "os 20%".
              const on = valor > 0 && entrada === doPct
              return (
                <button key={pct} className={on ? 'chip on' : 'chip'} aria-pressed={on} onClick={() => setEntrada(doPct)}>
                  {pct}%
                </button>
              )
            })}
          </div>
          {/* Cliente que ainda não pagou é comum: a obra começa assim mesmo, e a entrada vira
              um "+ entrada" normal no painel quando o dinheiro cair. */}
          <div className="ann">Cliente ainda não pagou? Deixe em R$ 0,00 e registre a entrada depois, no painel da obra.</div>
          {/* Regra combinada com os sócios: quem cria a obra está com o dinheiro da entrada
              e repassa a parte do outro. As entradas seguintes dizem com quem ficou. */}
          {entrada > 0 && (
            <span className="note" style={{ fontSize: 13, lineHeight: 1.4 }}>
              A entrada fica no seu caixa. Repasse ao sócio pelo painel, em Repasses.
            </span>
          )}
        </>
      )}

      {passo === 2 && (
        <>
          <h2 style={TITULO}>Confere?</h2>
          <div className="cd" style={{ padding: '14px 16px', gap: 9 }}>
            <div className="conta">
              <span>Obra</span>
              <span style={{ fontSize: 14, fontWeight: 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {nomeExibido}
              </span>
            </div>
            <div className="conta">
              <span>Valor fechado</span>
              <b>{fmt(valor)}</b>
            </div>
            <div className="conta">
              <span>Entrada</span>
              {entrada > 0 ? <b>{fmt(entrada)}</b> : <span style={{ fontSize: 14 }}>ainda não recebida</span>}
            </div>
            <div className="conta total" style={{ paddingTop: 10 }}>
              <span style={{ fontSize: 15 }}>Fica em aberto</span>
              <b style={{ fontSize: 24 }}>{fmt(aberto)}</b>
            </div>
          </div>
          <div className="ann">Aditivos entram depois, por fora deste valor.</div>
        </>
      )}

      <div className="row" style={{ marginTop: 'auto', gap: 8, paddingTop: 12, flex: 'none' }}>
        <button className="bt" style={{ flex: 1, minHeight: 50, borderRadius: 14 }} onClick={voltar}>
          Voltar
        </button>
        <button className="bt btp" style={{ flex: 2 }} onClick={avancar} disabled={salvando}>
          {passo === 2 ? (salvando ? 'criando…' : 'Criar obra') : 'Continuar'}
        </button>
      </div>
    </Tela>
  )
}

// Título de cada passo, dentro do miolo (o h1 é o "Nova obra" do cabeçalho).
const TITULO: CSSProperties = {
  margin: '8px 0 2px',
  fontFamily: 'var(--fonte-titulo)',
  fontWeight: 500,
  fontSize: 24,
  letterSpacing: '-.02em',
  lineHeight: 1.1,
}
