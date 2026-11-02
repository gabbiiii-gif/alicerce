import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AnimatePresence } from 'motion/react'
import { apagarObra, carregarObra, encerrarObra, listarSocios, notasDosLancamentos } from '../data/api'
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
      // Os sócios entram no acerto final mesmo sem lançamento (lib/relatorio.ts).
      const socios = await listarSocios().catch(() => [])
      const base = montarRelatorio(lancamentos, membros, 'personalizado', new Date(), { inicio, fim: hoje }, repasses, socios)
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
    <>
      <Tela titulo="Encerrar obra" voltar={`/obra/${obraId}`}>
        <span className="note" style={{ fontSize: 13, padding: '0 4px' }}>{obra.nome}</span>

        <div className="cd" style={{ padding: '14px 16px', gap: 9 }}>
          <div className="conta">
            <span>Total com aditivos</span>
            <b>{fmt(contas.total)}</b>
          </div>
          <div className="conta">
            <span>Recebido</span>
            <b>{fmt(contas.recebido)}</b>
          </div>
          <div className="conta total" style={{ paddingTop: 10, fontSize: 15 }}>
            <span>Em aberto</span>
            <b style={{ fontSize: 24 }}>{fmt(contas.aberto)}</b>
          </div>
        </div>

        <div className="cd" style={{ padding: '14px 16px', gap: 9 }}>
          <div className="conta">
            <span>saídas somadas ({membros.length} {membros.length === 1 ? 'pessoa' : 'pessoas'})</span>
            <b>{fmt(contas.saidas)}</b>
          </div>
          {/* A sobra é o resultado da obra: o rótulo sai do cinza e o número cresce. */}
          <div className="conta">
            <span style={{ fontSize: 14, color: 'var(--navy)' }}>Sobra</span>
            <b style={{ fontSize: 17 }}>{fmt(sobra)}</b>
          </div>
        </div>

        {contas.aberto > 0 && (
          <div className="ann ann-alerta">
            Ainda falta receber {fmt(contas.aberto)}. Dá para encerrar assim mesmo, fica registrado como saldo não quitado.
          </div>
        )}

        <div className="ann">Ao encerrar, o app gera o relatório final em PDF com tudo, dos dois usuários.</div>

        <div className="par" style={{ marginTop: 'auto', paddingTop: 12 }}>
          <button
            className="bt"
            style={{ minHeight: 50, borderRadius: 14 }}
            onClick={() => navigate(`/obra/${obraId}`)}
          >
            Ainda não
          </button>
          <button className="bt btp" style={{ flex: 2 }} onClick={confirmar} disabled={encerrando}>
            {encerrando ? 'encerrando…' : 'Encerrar obra'}
          </button>
        </div>

        {/* Apagar fica longe do botão de encerrar, em baixo e sem destaque: são coisas
            muito diferentes, e a que não tem volta não pode estar a um toque de distância
            da que é rotina. */}
        <button
          className="bt-texto"
          onClick={() => setConfirmandoApagar(true)}
          disabled={encerrando || apagando}
          style={{ color: 'var(--alerta)', padding: '12px 0 0' }}
        >
          apagar esta obra
        </button>
      </Tela>

      <AnimatePresence>
        {confirmandoApagar && (
          <Sheet aoFechar={() => setConfirmandoApagar(false)}>
            <div className="sheet-titulo">
              <b style={{ fontSize: 17 }}>Apagar {obra.nome}?</b>
            </div>
            <span className="note" style={{ fontSize: 13, lineHeight: 1.4 }}>
              Some a obra e tudo que está nela: {lancamentos.length}{' '}
              {lancamentos.length === 1 ? 'lançamento' : 'lançamentos'}, as fotos das notas, os
              aditivos e o histórico de quem gastou o quê.
            </span>
            {/* O número que dói: quem tem isto em aberto pensa duas vezes. */}
            {contas.aberto > 0 && (
              <div className="ann ann-alerta">
                Esta obra ainda tem {fmt(contas.aberto)} a receber. Apagando, esse saldo deixa de
                existir no app.
              </div>
            )}
            <div className="ann">
              Não tem como desfazer. Para só tirar a obra da lista sem perder nada, use
              <b style={{ fontWeight: 600 }}> Encerrar obra</b>.
            </div>
            <button
              className="bt"
              style={{ background: 'var(--alerta)', borderColor: 'var(--alerta)', color: '#fff' }}
              onClick={apagar}
              disabled={apagando}
            >
              {apagando ? 'apagando…' : 'Apagar para sempre'}
            </button>
            <button className="bt" onClick={() => setConfirmandoApagar(false)} disabled={apagando}>
              Cancelar
            </button>
          </Sheet>
        )}
      </AnimatePresence>
    </>
  )
}
