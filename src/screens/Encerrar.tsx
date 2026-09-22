import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { apagarObra, carregarObra, encerrarObra, notasDosLancamentos } from '../data/api'
import { useAsync } from '../lib/hooks'
import { useAviso } from '../components/Toast'
import { fmt, hojeISO } from '../lib/format'
import { montarRelatorio } from '../lib/relatorio'
import { baixarOuCompartilhar, gerarPdfRelatorio } from '../lib/pdf'
import { Carregando, Tela } from '../components/Tela'
import { Sheet } from '../components/Sheet'

export function Encerrar() {
  const { obraId = '' } = useParams()
  const navigate = useNavigate()
  const avisar = useAviso()
  const { dados, carregando, erro, recarregar } = useAsync(() => carregarObra(obraId), [obraId])
  const [encerrando, setEncerrando] = useState(false)
  const [apagando, setApagando] = useState(false)
  const [confirmandoApagar, setConfirmandoApagar] = useState(false)

  async function apagar() {
    setApagando(true)
    try {
      await apagarObra(obraId)
      avisar('Obra apagada')
      navigate('/obras', { replace: true })
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'não deu para apagar')
      setApagando(false)
    }
  }

  // Sem isto a tela girava para sempre quando a carga falhava: `erro` nao era lido e
  // `dados` nulo caia no mesmo if do `carregando`, sem cabecalho nem caminho de volta.
  if (!dados) {
    return (
      <Tela titulo="Encerrar obra" voltar={`/obra/${obraId}`}>
        {carregando && <Carregando />}
        {erro && !carregando && (
          <>
            <div className="ann">Não deu para abrir a obra: {erro}</div>
            <button className="bt" onClick={() => recarregar()}>Tentar de novo</button>
          </>
        )}
      </Tela>
    )
  }

  const { obra, contas, lancamentos, membros, repasses } = dados
  const sobra = contas.recebido - contas.saidas

  async function confirmar() {
    setEncerrando(true)
    try {
      await encerrarObra(obraId)

      // Fechamento da obra: relatório final com tudo, dos dois usuários — do primeiro
      // lançamento até hoje, com repasses e as notas fiscais de cada gasto.
      const hoje = hojeISO()
      const inicio = lancamentos.reduce((menor, l) => (l.data < menor ? l.data : menor), lancamentos[0]?.data ?? hoje)
      const base = montarRelatorio(lancamentos, membros, 'personalizado', new Date(), { inicio, fim: hoje }, repasses)
      const final = {
        ...base,
        titulo: lancamentos.length ? `desde ${inicio.split('-').reverse().join('/')}` : 'obra inteira',
        entradas: contas.recebido,
        saidas: contas.saidas,
      }
      // Um ano de validade: o PDF de fechamento é guardado e mandado ao cliente, e o link
      // da nota tem que abrir bem depois de hoje.
      const notas = await notasDosLancamentos(
        lancamentos.map(l => l.comprovante_id ?? ''),
        60 * 60 * 24 * 365,
      )

      const blob = await gerarPdfRelatorio(obra.nome, final, contas.aberto, 'Fechamento', notas)
      await baixarOuCompartilhar(blob, `alicerce-${obra.nome.toLowerCase().replace(/\s+/g, '-')}-fechamento.pdf`, `Fechamento ${obra.nome}`)
      avisar('Obra encerrada e relatório final gerado')
      navigate('/obras', { replace: true })
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
          <span className="note">Total com aditivos</span>
          <b style={{ fontSize: 14 }}>{fmt(contas.total)}</b>
        </div>
        <div className="row">
          <span className="note">Recebido</span>
          <b style={{ fontSize: 14 }}>{fmt(contas.recebido)}</b>
        </div>
        <div className="row" style={{ borderTop: '1px solid #E1EAF6', paddingTop: 6 }}>
          <span style={{ fontSize: 14 }}>Em aberto</span>
          <span className="big">{fmt(contas.aberto)}</span>
        </div>
      </div>

      <div className="cd">
        <div className="row">
          <span className="note">saídas somadas ({membros.length} pessoas)</span>
          <b style={{ fontSize: 14 }}>{fmt(contas.saidas)}</b>
        </div>
        <div className="row">
          <span className="note">Sobra</span>
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

      {/* Apagar fica longe do botão de encerrar, em baixo e sem destaque: são coisas
          muito diferentes, e a que não tem volta não pode estar a um toque de distância
          da que é rotina. */}
      <button
        className="note"
        onClick={() => setConfirmandoApagar(true)}
        disabled={encerrando || apagando}
        style={{ background: 'none', border: 'none', color: '#9A3412', paddingTop: 14, cursor: 'pointer', fontFamily: 'inherit' }}
      >
        apagar esta obra
      </button>

      {confirmandoApagar && (
        <Sheet aoFechar={() => setConfirmandoApagar(false)}>
          <b style={{ fontSize: 17 }}>Apagar {obra.nome}?</b>
          <span className="note">
            Some a obra e tudo que está nela: {lancamentos.length}{' '}
            {lancamentos.length === 1 ? 'lançamento' : 'lançamentos'}, as fotos das notas, os
            aditivos e o histórico de quem gastou o quê.
          </span>
          {/* O número que dói: quem tem isto em aberto pensa duas vezes. */}
          {contas.aberto > 0 && (
            <div className="ann" style={{ background: '#FFF7ED', borderColor: '#FBD5B5', color: '#9A3412' }}>
              Esta obra ainda tem {fmt(contas.aberto)} a receber. Apagando, esse saldo deixa de
              existir no app.
            </div>
          )}
          <div className="ann">
            Não tem como desfazer. Para só tirar a obra da lista sem perder nada, use
            <b> Encerrar obra</b>.
          </div>
          <button
            className="bt"
            style={{ width: '100%', background: '#9A3412', borderColor: '#9A3412', color: '#fff' }}
            onClick={apagar}
            disabled={apagando}
          >
            {apagando ? 'apagando…' : 'Apagar para sempre'}
          </button>
          <button className="bt" style={{ width: '100%' }} onClick={() => setConfirmandoApagar(false)} disabled={apagando}>
            Cancelar
          </button>
        </Sheet>
      )}
    </Tela>
  )
}
