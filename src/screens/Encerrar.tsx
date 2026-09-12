import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { carregarObra, encerrarObra } from '../data/api'
import { useAsync } from '../lib/hooks'
import { useAviso } from '../components/Toast'
import { fmt } from '../lib/format'
import { montarRelatorio } from '../lib/relatorio'
import { baixarOuCompartilhar, gerarPdfRelatorio } from '../lib/pdf'
import { Carregando, Tela } from '../components/Tela'

export function Encerrar() {
  const { obraId = '' } = useParams()
  const navigate = useNavigate()
  const avisar = useAviso()
  const { dados, carregando } = useAsync(() => carregarObra(obraId), [obraId])
  const [encerrando, setEncerrando] = useState(false)

  if (carregando || !dados) return <Carregando />

  const { obra, contas, lancamentos, membros } = dados
  const sobra = contas.recebido - contas.saidas

  async function confirmar() {
    setEncerrando(true)
    try {
      await encerrarObra(obraId)

      // Fechamento da obra: relatório final com tudo, dos dois usuários.
      const inicio = lancamentos.reduce((menor, l) => (l.data < menor ? l.data : menor), lancamentos[0]?.data ?? '')
      const relatorio = montarRelatorio(lancamentos, membros, 'mes')
      const final = {
        ...relatorio,
        titulo: inicio ? `desde ${inicio.split('-').reverse().join('/')}` : 'obra inteira',
        inicio: inicio || relatorio.inicio,
        fim: new Date().toISOString().slice(0, 10),
        entradas: contas.recebido,
        saidas: contas.saidas,
        porPessoa: membros.map(m => {
          const itens = lancamentos.filter(l => l.autor_id === m.user_id && l.tipo === 'saida')
          return {
            userId: m.user_id,
            nome: m.profile.nome.split(' ')[0],
            iniciais: m.profile.iniciais,
            total: itens.reduce((s, l) => s + Number(l.valor), 0),
            itens: itens.map(l => ({
              esquerda: `${l.data.split('-').reverse().slice(0, 2).join('/')} ${l.descricao} · ${l.categoria?.nome ?? 'sem categoria'}`,
              direita: fmt(l.valor).replace('R$ ', ''),
            })),
          }
        }),
      }

      const blob = await gerarPdfRelatorio(obra.nome, final, contas.aberto, 'Fechamento')
      await baixarOuCompartilhar(blob, `alicerce-${obra.nome.toLowerCase().replace(/\s+/g, '-')}-fechamento.pdf`, `Fechamento ${obra.nome}`)
      avisar('Obra encerrada e relatório final gerado')
      navigate('/', { replace: true })
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'não deu para encerrar')
      setEncerrando(false)
    }
  }

  return (
    <Tela titulo="Encerrar obra" voltar={`/obra/${obraId}`}>
      <div className="note">{obra.nome}</div>

      <div className="cd">
        <div className="row">
          <span className="note">total com aditivos</span>
          <b style={{ fontSize: 14 }}>{fmt(contas.total)}</b>
        </div>
        <div className="row">
          <span className="note">recebido</span>
          <b style={{ fontSize: 14 }}>{fmt(contas.recebido)}</b>
        </div>
        <div className="row" style={{ borderTop: '1px solid #E1EAF6', paddingTop: 6 }}>
          <span style={{ fontSize: 14 }}>em aberto</span>
          <span className="big">{fmt(contas.aberto)}</span>
        </div>
      </div>

      <div className="cd">
        <div className="row">
          <span className="note">saídas somadas ({membros.length} pessoas)</span>
          <b style={{ fontSize: 14 }}>{fmt(contas.saidas)}</b>
        </div>
        <div className="row">
          <span className="note">sobra</span>
          <b style={{ fontSize: 16 }}>{fmt(sobra)}</b>
        </div>
      </div>

      {contas.aberto > 0 && (
        <div className="ann">
          Ainda falta receber {fmt(contas.aberto)}. Dá para encerrar assim mesmo, fica registrado como saldo não quitado.
        </div>
      )}

      <div className="ann">Ao encerrar, o app gera o relatório final em PDF com tudo, dos dois usuários.</div>

      <div className="row" style={{ marginTop: 'auto', gap: 8 }}>
        <button className="bt" style={{ flex: 1 }} onClick={() => navigate(`/obra/${obraId}`)}>Ainda não</button>
        <button className="bt btp" style={{ flex: 2 }} onClick={confirmar} disabled={encerrando}>
          {encerrando ? 'encerrando…' : 'Encerrar obra'}
        </button>
      </div>
    </Tela>
  )
}
