import { useState } from 'react'
import { editarObra } from '../data/api'
import { comoNome, fmt } from '../lib/format'
import type { ContasObra, Obra } from '../lib/types'
import { useAviso } from './Toast'
import { Sheet } from './Sheet'
import { MoedaInput } from './MoedaInput'

// Corrigir o que foi digitado ao criar a obra: nome, endereço e valor fechado.
// Entrada e aditivos não entram aqui — cada um tem o próprio lançamento no painel.
export function EditarObraSheet({
  obra,
  contas,
  aoFechar,
  aoSalvar,
}: {
  obra: Obra
  contas: ContasObra
  aoFechar: () => void
  aoSalvar: () => Promise<void> | void
}) {
  const avisar = useAviso()
  // A obra como estava ao abrir a folha. O Painel recarrega sozinho quando o sócio mexe na
  // obra, e comparar com a versão nova acusaria como mudança da pessoa o que foi ele quem fez.
  const [base] = useState(obra)
  const [nome, setNome] = useState(base.nome)
  const [endereco, setEndereco] = useState(base.endereco ?? '')
  const [valor, setValor] = useState(Number(base.valor_fechado))
  const [salvando, setSalvando] = useState(false)

  const mudouNome = comoNome(nome) !== base.nome
  const mudouEndereco = (comoNome(endereco) || null) !== (base.endereco || null)
  const mudouValor = valor !== Number(base.valor_fechado)
  const mudou = mudouNome || mudouEndereco || mudouValor

  async function salvar() {
    if (!nome.trim()) return avisar('A obra precisa de um nome')
    if (valor <= 0) return avisar('Informe o valor fechado')
    if (!mudou) return aoFechar()
    setSalvando(true)
    try {
      await editarObra(base.id, {
        nome: mudouNome ? nome : undefined,
        endereco: mudouEndereco ? endereco : undefined,
        valorFechado: mudouValor ? valor : undefined,
      })
      avisar('Obra atualizada')
      aoFechar()
      await aoSalvar()
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'não deu para salvar')
      setSalvando(false)
    }
  }

  // O valor fechado mexe no total e no que falta receber: a conta nova aparece antes de salvar.
  // Sobre os números de agora, que já trazem o que o sócio tiver lançado nesse meio-tempo.
  const novoTotal = contas.total - Number(obra.valor_fechado) + valor
  const novoAberto = Math.max(novoTotal - contas.recebido, 0)

  return (
    <Sheet aoFechar={aoFechar}>
      <b style={{ fontSize: 17 }}>Editar obra</b>

      <label className="note" htmlFor="obra-nome">Nome da obra</label>
      <input id="obra-nome" className="inp" value={nome} onChange={e => setNome(e.target.value)} />

      <label className="note" htmlFor="obra-endereco">Endereço</label>
      <input
        id="obra-endereco"
        className="inp"
        placeholder="sem endereço"
        value={endereco}
        onChange={e => setEndereco(e.target.value)}
      />

      <label className="note" htmlFor="obra-valor">Valor fechado com o cliente</label>
      <MoedaInput id="obra-valor" valor={valor} aoMudar={setValor} />

      {mudouValor && valor > 0 && (
        <div className="row" style={{ background: '#E0F4FF', border: '1px solid #C4E4FB', borderRadius: 10, padding: '6px 9px' }}>
          <span className="note" style={{ color: '#0A2A6E' }}>
            novo total <span className="num">{fmt(novoTotal)}</span>
          </span>
          <span className="note" style={{ color: '#0A2A6E' }}>
            em aberto <b className="num" style={{ fontSize: 14 }}>{fmt(novoAberto)}</b>
          </span>
        </div>
      )}

      <div className="note">Quem divide a obra com você recebe um aviso com o que mudou.</div>

      <button className="bt btp" onClick={salvar} disabled={salvando || !mudou}>
        {salvando ? 'salvando…' : 'Salvar alterações'}
      </button>
      <div className="note" style={{ textAlign: 'center', cursor: 'pointer' }} onClick={aoFechar}>
        fechar
      </div>
    </Sheet>
  )
}
