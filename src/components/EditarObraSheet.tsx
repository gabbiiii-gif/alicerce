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
      <div className="sheet-titulo">
        <b>Editar obra</b>
      </div>

      <label className="rotulo" htmlFor="obra-nome">
        Nome da obra
        <input id="obra-nome" className="inp" value={nome} onChange={e => setNome(e.target.value)} />
      </label>

      <label className="rotulo" htmlFor="obra-endereco">
        Endereço
        <input
          id="obra-endereco"
          className="inp"
          placeholder="sem endereço"
          value={endereco}
          onChange={e => setEndereco(e.target.value)}
        />
      </label>

      <label className="rotulo" htmlFor="obra-valor">
        Valor fechado com o cliente
        <MoedaInput id="obra-valor" valor={valor} aoMudar={setValor} />
      </label>

      {mudouValor && valor > 0 && (
        <div className="ann" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            novo total <span className="num">{fmt(novoTotal)}</span>
          </span>
          <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
            em aberto
            <span className="num" style={{ fontSize: 15, fontWeight: 500, color: 'var(--navy)' }}>{fmt(novoAberto)}</span>
          </span>
        </div>
      )}

      <div className="note" style={{ fontSize: 13 }}>Quem divide a obra com você recebe um aviso com o que mudou.</div>

      <button className="bt btp" onClick={salvar} disabled={salvando || !mudou}>
        {salvando ? 'salvando…' : 'Salvar alterações'}
      </button>
      <button className="bt-texto" onClick={aoFechar}>fechar</button>
    </Sheet>
  )
}
