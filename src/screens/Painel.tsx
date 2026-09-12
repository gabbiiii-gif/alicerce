import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { apagarLancamento, carregarObra, criarAditivo, registrarEntrada } from '../data/api'
import { useAsync } from '../lib/hooks'
import { useUsuario } from '../lib/auth'
import { useObraAtual } from '../lib/obraAtual'
import { useAviso } from '../components/Toast'
import { curto, dataCurta, fmt, semSimbolo } from '../lib/format'
import { Carregando, Tela } from '../components/Tela'
import { TabBar } from '../components/TabBar'
import { ValorAnimado } from '../components/ValorAnimado'
import { Barra } from '../components/Barra'
import { Sheet } from '../components/Sheet'
import { MoedaInput } from '../components/MoedaInput'
import { AnimatePresence, motion } from 'motion/react'
import { CURVA } from '../lib/animacao'
import type { Lancamento } from '../lib/types'

type SheetAberto = 'entrada' | 'aditivo' | null

export function Painel() {
  const { obraId = '' } = useParams()
  const navigate = useNavigate()
  const { userId, perfil } = useUsuario()
  const { definir } = useObraAtual()
  const avisar = useAviso()

  const { dados, carregando, erro, recarregar } = useAsync(() => carregarObra(obraId), [obraId])
  const [sheet, setSheet] = useState<SheetAberto>(null)
  const [valor, setValor] = useState(0)
  const [descricao, setDescricao] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [selecionado, setSelecionado] = useState<Lancamento | null>(null)

  useEffect(() => {
    if (obraId) definir(obraId)
  }, [obraId, definir])

  if (carregando) return <Carregando />
  if (erro || !dados) {
    return (
      <Tela titulo="Obra" voltar="/">
        <div className="ann">Não deu para abrir a obra: {erro}</div>
        <button className="bt" onClick={() => recarregar()}>tentar de novo</button>
      </Tela>
    )
  }

  const { obra, lancamentos, contas } = dados

  const mesAtual = new Date().toISOString().slice(0, 7)
  const saidasDoMes = lancamentos
    .filter(l => l.tipo === 'saida' && l.data.startsWith(mesAtual))
    .reduce((s, l) => s + Number(l.valor), 0)
  const estouro = obra.previsto_mensal > 0 && saidasDoMes > obra.previsto_mensal

  function abrirSheet(qual: Exclude<SheetAberto, null>) {
    setValor(0)
    setDescricao('')
    setSheet(qual)
  }

  async function salvar() {
    if (valor <= 0) return avisar(sheet === 'aditivo' ? 'Informe o valor do aditivo' : 'Informe o valor recebido')
    setSalvando(true)
    try {
      if (sheet === 'aditivo') {
        await criarAditivo({ obraId, autorId: userId, descricao, valor })
        avisar('Aditivo somado ao total')
      } else {
        await registrarEntrada({ obraId, autorId: userId, valor, descricao })
        avisar('Entrada registrada')
      }
      setSheet(null)
      await recarregar()
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'não deu para salvar')
    } finally {
      setSalvando(false)
    }
  }

  async function apagar(lancamento: Lancamento) {
    try {
      await apagarLancamento(lancamento.id)
      setSelecionado(null)
      avisar('Lançamento apagado')
      await recarregar()
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'não deu para apagar')
    }
  }

  return (
    <>
      <Tela titulo={obra.nome} voltar="/" comAbas acao={<div className="av">{perfil?.iniciais ?? '·'}</div>}>
        <div className="cd">
          <div className="row">
            <span className="note">valor fechado</span>
            <b style={{ fontSize: 14 }}>{fmt(obra.valor_fechado)}</b>
          </div>
          <div className="row">
            <span className="note">+ aditivos ({dados.aditivos.length})</span>
            <b style={{ fontSize: 14, color: '#2272CC' }}>{fmt(contas.aditivos)}</b>
          </div>
          <div className="row" style={{ borderTop: '1px solid #E1EAF6', paddingTop: 6 }}>
            <span style={{ fontSize: 14 }}>total</span>
            {/* Conta até o valor: é o número principal da tela, e a contagem faz o olho pousar nele. */}
            <ValorAnimado className="big" valor={contas.total} formatar={fmt} />
          </div>
          <Barra pct={contas.pct} cor="#0A2A6E" />
          <div className="row">
            <span className="note">recebido {curto(contas.recebido)}</span>
            <span className="note">em aberto {fmt(contas.aberto)}</span>
          </div>
        </div>

        {estouro && (
          <div className="ann">⚠ Agente: as saídas do mês passaram do previsto em {fmt(saidasDoMes - obra.previsto_mensal)}.</div>
        )}

        <div className="row" style={{ gap: 6, justifyContent: 'flex-start', flexWrap: 'wrap' }}>
          <button className="chip" onClick={() => navigate(`/obra/${obraId}/equipe`)}>Equipe</button>
          <button className="chip" onClick={() => navigate(`/obra/${obraId}/categorias`)}>Categorias</button>
          <button className="chip" onClick={() => navigate(`/obra/${obraId}/encerrar`)}>Encerrar</button>
        </div>

        <div className="row">
          <span style={{ fontSize: 15, fontWeight: 500, fontFamily: "'Instrument Sans', sans-serif" }}>Lançamentos da obra</span>
          <span className="note">saídas {fmt(contas.saidas)}</span>
        </div>

        {lancamentos.map((l, i) => (
          // Em cascata, não todos de uma vez. O atraso para no oitavo item: numa obra
          // com cem lançamentos, esperar a cascata inteira seria pior que não ter.
          <motion.button
            key={l.id}
            className="li"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...CURVA, delay: Math.min(i, 8) * 0.035 }}
            onClick={() => setSelecionado(l)}
          >
            <div>
              <b style={{ fontSize: 13.5 }}>{l.descricao}</b>
              <div className="note">
                {(l.categoria?.nome || 'entrada') + ' · ' + dataCurta(l.data) + ' · ' +
                  (l.autor_id === userId ? 'você' : (l.autor?.nome ?? '').split(' ')[0] || 'equipe')}
              </div>
            </div>
            <b style={{ fontSize: 13.5 }}>{(l.tipo === 'saida' ? '−' : '+') + semSimbolo(l.valor)}</b>
          </motion.button>
        ))}

        {lancamentos.length === 0 && <div className="dsh" style={{ padding: 18 }}>nenhum lançamento nesta obra ainda</div>}

        <div className="row" style={{ gap: 8, paddingTop: 4 }}>
          <button className="bt" style={{ flex: 1 }} onClick={() => abrirSheet('entrada')}>+ entrada</button>
          <button className="bt" style={{ flex: 1 }} onClick={() => abrirSheet('aditivo')}>+ aditivo</button>
          <button className="bt bta" style={{ flex: 1 }} onClick={() => navigate(`/obra/${obraId}/enviar`)}>+ saída</button>
        </div>
      </Tela>

      <AnimatePresence>
      {sheet && (
        <Sheet aoFechar={() => setSheet(null)}>
          <div className="row">
            <b style={{ fontSize: 17 }}>{sheet === 'aditivo' ? 'Aditivo' : 'Entrada do cliente'}</b>
            <span className="note">{sheet === 'aditivo' ? 'fora do valor fechado' : 'abate o saldo'}</span>
          </div>
          <MoedaInput valor={valor} aoMudar={setValor} style={{ fontSize: 25, textAlign: 'center', padding: 12 }} autoFocus />
          <input
            className="inp"
            placeholder={sheet === 'aditivo' ? 'motivo (troca de piso…)' : 'descrição (parcela 3…)'}
            value={descricao}
            onChange={e => setDescricao(e.target.value)}
          />
          <div className="row" style={{ background: '#E0F4FF', border: '1px solid #C4E4FB', borderRadius: 10, padding: '6px 9px' }}>
            <span className="note" style={{ color: '#0A2A6E' }}>{sheet === 'aditivo' ? 'novo total' : 'fica em aberto'}</span>
            <b style={{ fontSize: 15 }}>
              {sheet === 'aditivo' ? fmt(contas.total + valor) : fmt(Math.max(contas.aberto - valor, 0))}
            </b>
          </div>
          <button className="bt btp" onClick={salvar} disabled={salvando}>
            {salvando ? 'salvando…' : sheet === 'aditivo' ? 'Salvar aditivo' : 'Registrar entrada'}
          </button>
        </Sheet>
      )}
      </AnimatePresence>

      <AnimatePresence>
      {selecionado && (
        <Sheet aoFechar={() => setSelecionado(null)}>
          <div className="row">
            <b style={{ fontSize: 17 }}>{selecionado.descricao}</b>
            <b style={{ fontSize: 15 }}>{(selecionado.tipo === 'saida' ? '−' : '+') + fmt(selecionado.valor)}</b>
          </div>
          <div className="note">
            {(selecionado.categoria?.nome || 'entrada') + ' · ' + dataCurta(selecionado.data) + ' · enviado por ' +
              (selecionado.autor_id === userId ? 'você' : selecionado.autor?.nome ?? 'alguém da equipe')}
          </div>
          {selecionado.autor_id === userId ? (
            <button className="bt" onClick={() => apagar(selecionado)}>Apagar lançamento</button>
          ) : (
            <div className="ann">Só quem lançou pode editar ou apagar.</div>
          )}
          <div className="note" style={{ textAlign: 'center', cursor: 'pointer' }} onClick={() => setSelecionado(null)}>
            fechar
          </div>
        </Sheet>
      )}
      </AnimatePresence>

      <TabBar ativa="obras" />
    </>
  )
}
