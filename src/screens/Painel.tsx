import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  apagarAditivo, apagarLancamento, carregarComprovante, carregarObra, criarAditivo, registrarEntrada, urlComprovante,
} from '../data/api'
import { useAsync } from '../lib/hooks'
import { useUsuario } from '../lib/auth'
import { useObraAtual } from '../lib/obraAtual'
import { usePlano } from '../lib/plano'
import { useAviso } from '../components/Toast'
import { curto, dataCurta, fmt, semSimbolo } from '../lib/format'
import { Carregando, Tela } from '../components/Tela'
import { TabBar } from '../components/TabBar'
import { AvisoPlano } from '../components/AvisoPlano'
import { ValorAnimado } from '../components/ValorAnimado'
import { Barra } from '../components/Barra'
import { Sheet } from '../components/Sheet'
import { MoedaInput } from '../components/MoedaInput'
import { AnimatePresence, motion } from 'motion/react'
import { CURVA } from '../lib/animacao'
import type { Aditivo, Lancamento } from '../lib/types'

type SheetAberto = 'entrada' | 'aditivo' | null

export function Painel() {
  const { obraId = '' } = useParams()
  const navigate = useNavigate()
  const { userId, perfil } = useUsuario()
  const { definir } = useObraAtual()
  const { vale } = usePlano()
  const avisar = useAviso()

  const { dados, carregando, erro, recarregar } = useAsync(() => carregarObra(obraId), [obraId])
  const [sheet, setSheet] = useState<SheetAberto>(null)
  const [valor, setValor] = useState(0)
  const [descricao, setDescricao] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [selecionado, setSelecionado] = useState<Lancamento | null>(null)
  const [verAditivos, setVerAditivos] = useState(false)
  // Remover muda o total da obra: o primeiro toque só arma, o segundo remove.
  const [removerId, setRemoverId] = useState<string | null>(null)
  const [removendo, setRemovendo] = useState(false)
  const [notaUrl, setNotaUrl] = useState<string | null>(null)

  useEffect(() => {
    if (obraId) definir(obraId)
  }, [obraId, definir])

  // O link da nota é buscado ao abrir o lançamento, não no toque do botão: aberto depois de
  // um await, o navegador trata como pop-up e bloqueia. Só o autor lê a própria nota (RLS).
  useEffect(() => {
    setNotaUrl(null)
    if (!selecionado?.comprovante_id || selecionado.autor_id !== userId) return
    let ativo = true
    carregarComprovante(selecionado.comprovante_id)
      .then(c => urlComprovante(c.storage_path))
      .then(url => ativo && setNotaUrl(url))
      .catch(() => {})
    return () => {
      ativo = false
    }
  }, [selecionado, userId])

  if (carregando) return <Carregando />
  if (erro || !dados) {
    return (
      <Tela titulo="Obra" voltar="/">
        <div className="ann">Não deu para abrir a obra: {erro}</div>
        <button className="bt" onClick={() => recarregar()}>Tentar de novo</button>
      </Tela>
    )
  }

  const { obra, lancamentos, contas } = dados

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

  async function removerAditivo(aditivo: Aditivo) {
    if (removerId !== aditivo.id) return setRemoverId(aditivo.id)
    setRemovendo(true)
    try {
      await apagarAditivo(aditivo.id)
      setRemoverId(null)
      avisar('Aditivo removido do total')
      await recarregar()
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'não deu para remover')
    } finally {
      setRemovendo(false)
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
        <AvisoPlano />
        <div className="cd">
          <div className="row">
            <span className="note">Valor fechado</span>
            <b className="num" style={{ fontSize: 14 }}>{fmt(obra.valor_fechado)}</b>
          </div>
          {/* Tocável para ver e remover: um aditivo lançado errado inflava o total para sempre. */}
          <button
            className="row"
            onClick={() => {
              setRemoverId(null)
              setVerAditivos(true)
            }}
            disabled={dados.aditivos.length === 0}
            style={{ width: '100%', background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'inherit', opacity: 1, cursor: dados.aditivos.length ? 'pointer' : 'default' }}
          >
            <span className="note">
              + aditivos ({dados.aditivos.length}){dados.aditivos.length > 0 && <span style={{ color: '#2272CC' }}> · ver</span>}
            </span>
            <b className="num" style={{ fontSize: 14, color: '#2272CC' }}>{fmt(contas.aditivos)}</b>
          </button>
          <div className="row" style={{ borderTop: '1px solid #E1EAF6', paddingTop: 6 }}>
            <span style={{ fontSize: 14 }}>Total</span>
            {/* Conta até o valor: é o número principal da tela, e a contagem faz o olho pousar nele. */}
            <ValorAnimado className="big num" valor={contas.total} formatar={fmt} />
          </div>
          <Barra pct={contas.pct} cor="#0A2A6E" />
          <div className="row">
            <span className="note">Recebido <span className="num">{curto(contas.recebido)}</span></span>
            <span className="note">Em aberto <span className="num">{fmt(contas.aberto)}</span></span>
          </div>
        </div>

        <div className="row" style={{ gap: 6, justifyContent: 'flex-start', flexWrap: 'wrap' }}>
          <button className="chip" onClick={() => navigate(`/obra/${obraId}/notas`)}>Notas fiscais</button>
          <button className="chip" onClick={() => navigate(`/obra/${obraId}/equipe`)}>Equipe</button>
          <button className="chip" onClick={() => navigate(`/obra/${obraId}/categorias`)}>Categorias</button>
          <button className="chip" onClick={() => navigate(`/obra/${obraId}/encerrar`)}>Encerrar</button>
        </div>

        <div className="row">
          <span style={{ fontSize: 15, fontWeight: 500, fontFamily: 'var(--fonte-titulo)' }}>Lançamentos da obra</span>
          <span className="note">Saídas <span className="num">{fmt(contas.saidas)}</span></span>
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
            <b className="num" style={{ fontSize: 13.5 }}>{(l.tipo === 'saida' ? '−' : '+') + semSimbolo(l.valor)}</b>
          </motion.button>
        ))}

        {lancamentos.length === 0 && <div className="dsh" style={{ padding: 18 }}>Nenhum lançamento nesta obra ainda</div>}

        {/* Desligados sem plano: a policy de insert vai recusar de qualquer jeito, e é
            melhor a pessoa ver o botão apagado com a faixa explicando do que preencher o
            lançamento inteiro para levar um erro de banco no fim. */}
        <div className="row" style={{ gap: 8, paddingTop: 4 }}>
          <button className="bt" style={{ flex: 1 }} disabled={!vale} onClick={() => abrirSheet('entrada')}>+ entrada</button>
          <button className="bt" style={{ flex: 1 }} disabled={!vale} onClick={() => abrirSheet('aditivo')}>+ aditivo</button>
          <button className="bt bta" style={{ flex: 1 }} disabled={!vale} onClick={() => navigate(`/obra/${obraId}/enviar`)}>+ saída</button>
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
            placeholder={sheet === 'aditivo' ? 'Motivo (troca de piso…)' : 'Descrição (parcela 3…)'}
            value={descricao}
            onChange={e => setDescricao(e.target.value)}
          />
          <div className="row" style={{ background: '#E0F4FF', border: '1px solid #C4E4FB', borderRadius: 10, padding: '6px 9px' }}>
            <span className="note" style={{ color: '#0A2A6E' }}>{sheet === 'aditivo' ? 'novo total' : 'fica em aberto'}</span>
            <b className="num" style={{ fontSize: 15 }}>
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
            <b className="num" style={{ fontSize: 15 }}>{(selecionado.tipo === 'saida' ? '−' : '+') + fmt(selecionado.valor)}</b>
          </div>
          <div className="note">
            {(selecionado.categoria?.nome || 'entrada') + ' · ' + dataCurta(selecionado.data) + ' · enviado por ' +
              (selecionado.autor_id === userId ? 'você' : selecionado.autor?.nome ?? 'alguém da equipe')}
          </div>
          {notaUrl && (
            <a className="bt" href={notaUrl} target="_blank" rel="noreferrer" style={{ textAlign: 'center', textDecoration: 'none' }}>
              Ver nota fiscal
            </a>
          )}
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

      <AnimatePresence>
      {verAditivos && (
        <Sheet aoFechar={() => setVerAditivos(false)}>
          <div className="row">
            <b style={{ fontSize: 17 }}>Aditivos</b>
            <b className="num" style={{ fontSize: 15, color: '#2272CC' }}>{fmt(contas.aditivos)}</b>
          </div>
          {dados.aditivos.length === 0 && <div className="note">Nenhum aditivo nesta obra.</div>}
          {dados.aditivos.map(a => (
            <div key={a.id} className="li" style={{ cursor: 'default' }}>
              <div style={{ minWidth: 0 }}>
                <b style={{ fontSize: 13.5 }}>{a.descricao}</b>
                <div className="note">
                  {dataCurta(a.created_at.slice(0, 10)) + ' · ' + (a.autor_id === userId ? 'você' : 'equipe')}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <b className="num" style={{ fontSize: 13.5 }}>{'+' + semSimbolo(a.valor)}</b>
                {a.autor_id === userId && (
                  <button
                    className="chip"
                    onClick={() => removerAditivo(a)}
                    disabled={removendo}
                    style={removerId === a.id ? { borderColor: '#FBD5B5', color: '#9A3412', whiteSpace: 'nowrap' } : { whiteSpace: 'nowrap' }}
                  >
                    {removerId === a.id ? (removendo ? 'removendo…' : 'confirmar') : 'remover'}
                  </button>
                )}
              </div>
            </div>
          ))}
          {removerId && (
            <div className="ann">
              Removendo, o total da obra cai para{' '}
              {fmt(contas.total - Number(dados.aditivos.find(a => a.id === removerId)?.valor ?? 0))}.
            </div>
          )}
          <div className="note" style={{ textAlign: 'center' }}>Só quem lançou o aditivo pode remover.</div>
          <div className="note" style={{ textAlign: 'center', cursor: 'pointer' }} onClick={() => setVerAditivos(false)}>
            fechar
          </div>
        </Sheet>
      )}
      </AnimatePresence>

      <TabBar ativa="obras" />
    </>
  )
}
