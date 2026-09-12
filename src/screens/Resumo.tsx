import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { carregarRelatorioGeral, listarObras } from '../data/api'
import { useAsync } from '../lib/hooks'
import { useUsuario } from '../lib/auth'
import { useObraAtual } from '../lib/obraAtual'
import { montarVisao, COR_PREVISTO, COR_SAIDA } from '../lib/dashboard'
import { curto, dataCurta, fmt, semSimbolo } from '../lib/format'
import { CURVA } from '../lib/animacao'
import { Carregando, Tela, Vazio } from '../components/Tela'
import { TabBar } from '../components/TabBar'
import { ValorAnimado } from '../components/ValorAnimado'
import { Grafico3D } from '../components/Grafico3D'
import { CurvaAvanco } from '../components/CurvaAvanco'

function Titulo({ texto, nota }: { texto: string; nota?: string }) {
  return (
    <div className="row" style={{ marginTop: 6 }}>
      <span style={{ fontSize: 15, fontWeight: 500, fontFamily: 'var(--fonte-titulo)' }}>{texto}</span>
      {nota && <span className="note">{nota}</span>}
    </div>
  )
}

export function Resumo() {
  const navigate = useNavigate()
  const { perfil } = useUsuario()
  const { definir } = useObraAtual()

  const { dados, carregando, erro, recarregar } = useAsync(async () => {
    const [obras, geral] = await Promise.all([listarObras(), carregarRelatorioGeral()])
    return { obras, lancamentos: geral.lancamentos }
  }, [])

  const visao = useMemo(() => (dados ? montarVisao(dados.obras, dados.lancamentos) : null), [dados])

  if (!dados || !visao) {
    return (
      <>
        <Tela titulo="Resumo" comAbas>
          {carregando && <Carregando />}
          {erro && !carregando && (
            <>
              <div className="ann">Não deu para montar o resumo: {erro}</div>
              <button className="bt" onClick={() => recarregar()}>tentar de novo</button>
            </>
          )}
        </Tela>
        <TabBar ativa="resumo" />
      </>
    )
  }

  const noVermelho = visao.margem < 0

  function abrirObra(id: string) {
    definir(id)
    navigate(`/obra/${id}`)
  }

  return (
    <>
      <Tela titulo="Resumo" comAbas acao={<div className="av">{perfil?.iniciais ?? '·'}</div>}>
        {dados.obras.length === 0 ? (
          <Vazio>
            nada para resumir ainda
            <br />
            <span style={{ fontSize: 12 }}>cadastre uma obra para ver seus números aqui</span>
          </Vazio>
        ) : (
          <>
            {/* A margem vem primeiro, e não o faturamento: é ela que diz se a obra se
                paga hoje. Negativa significa tocar a obra com dinheiro que ainda não
                entrou — a informação que mais cedo muda uma decisão. */}
            <motion.div
              className="cd"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={CURVA}
              style={{
                background: noVermelho ? '#7C2D12' : 'var(--navy)',
                borderColor: noVermelho ? '#7C2D12' : 'var(--navy)',
                padding: '14px 14px 12px',
              }}
            >
              <span className="note" style={{ color: noVermelho ? '#FDBA74' : '#9FC4F0' }}>
                {noVermelho ? 'no vermelho — gasto maior que o recebido' : 'sobra em caixa (recebido − gasto)'}
              </span>
              <ValorAnimado
                className="num"
                valor={Math.abs(visao.margem)}
                formatar={v => (noVermelho ? '−' : '') + fmt(v)}
                style={{ fontSize: 30, color: '#fff', fontFamily: 'var(--fonte-dados)', letterSpacing: '-.03em' }}
              />
              <span className="note" style={{ color: noVermelho ? '#FDBA74' : '#9FC4F0' }}>
                {visao.mesesDeFolego !== null
                  ? `dá para ${visao.mesesDeFolego.toFixed(1).replace('.', ',')} ${visao.mesesDeFolego < 2 ? 'mês' : 'meses'} no ritmo atual`
                  : `a receber ${fmt(visao.aberto)} · ${visao.obrasAtivas} ${visao.obrasAtivas === 1 ? 'obra' : 'obras'}`}
              </span>
            </motion.div>

            <div className="row" style={{ gap: 8, alignItems: 'stretch' }}>
              {[
                { rotulo: 'a receber', valor: fmt(visao.aberto) },
                { rotulo: 'ritmo mensal', valor: fmt(visao.ritmoMensal) },
              ].map((m, i) => (
                <motion.div
                  key={m.rotulo}
                  className="cd"
                  style={{ flex: 1, gap: 2 }}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...CURVA, delay: 0.05 + i * 0.05 }}
                >
                  <span className="note">{m.rotulo}</span>
                  <b className="num" style={{ fontSize: 17 }}>{m.valor}</b>
                </motion.div>
              ))}
            </div>

            {/* Estouro do mês vem antes de qualquer gráfico: é o único item desta tela
                em que ainda dá para agir, e mês fechado não se conserta. */}
            {visao.emRisco.length > 0 && (
              <>
                <Titulo texto="Passou do previsto" nota="este mês" />
                {visao.emRisco.map(o => (
                  <button
                    key={o.id}
                    className="cd"
                    onClick={() => abrirObra(o.id)}
                    style={{ borderColor: COR_SAIDA, background: '#FFF7ED', textAlign: 'left', cursor: 'pointer', gap: 3 }}
                  >
                    <div className="row">
                      <b style={{ fontSize: 14 }}>{o.nome}</b>
                      <b className="num" style={{ fontSize: 14, color: '#9A3412' }}>+{semSimbolo(o.excesso)}</b>
                    </div>
                    <span className="note" style={{ color: '#9A3412' }}>
                      gastou <span className="num">{curto(o.gastoMes)}</span> num mês previsto para{' '}
                      <span className="num">{curto(o.previsto)}</span>
                    </span>
                  </button>
                ))}
              </>
            )}

            <Titulo texto="Avanço financeiro" nota="acumulado" />
            <div className="cd" style={{ padding: '12px 10px 8px', gap: 4 }}>
              <CurvaAvanco meses={visao.meses} maior={visao.maiorAcum} />
              <div className="ann" style={{ marginTop: 2 }}>
                Enquanto a faixa entre as duas linhas é larga, a obra se paga. Quando fecha, está
                sendo tocada com dinheiro que ainda não entrou.
              </div>
            </div>

            <Titulo texto="Gasto x previsto" nota="mês a mês" />
            <div className="cd" style={{ padding: '10px 8px 6px', gap: 2 }}>
              <Grafico3D meses={visao.meses} maior={visao.maiorMes} />
              <div className="row" style={{ justifyContent: 'center', gap: 16, paddingTop: 2 }}>
                {[
                  { cor: COR_PREVISTO, texto: 'previsto' },
                  { cor: COR_SAIDA, texto: 'gasto' },
                ].map(l => (
                  <span key={l.texto} className="row" style={{ gap: 5, flex: 'none' }}>
                    <i style={{ width: 9, height: 9, borderRadius: 2, background: l.cor, display: 'block' }} />
                    <span className="note">{l.texto}</span>
                  </span>
                ))}
              </div>
            </div>

            <div className="cd" style={{ gap: 5 }}>
              <div className="row">
                <span className="note">orçamento do mês</span>
                <b className="num" style={{ fontSize: 14 }}>{fmt(visao.previstoMes)}</b>
              </div>
              <div className="row">
                <span className="note">gasto até agora</span>
                <b className="num" style={{ fontSize: 14, color: visao.mesSaidas > visao.previstoMes && visao.previstoMes > 0 ? COR_SAIDA : undefined }}>
                  {fmt(visao.mesSaidas)}
                </b>
              </div>
              <div className="row" style={{ borderTop: '1px solid var(--linha)', paddingTop: 5 }}>
                <span style={{ fontSize: 14 }}>do contrato já executado</span>
                <b className="num" style={{ fontSize: 16 }}>{visao.executadoPct}%</b>
              </div>
            </div>

            {visao.categorias.length > 0 && (
              <>
                <Titulo texto="Onde o dinheiro foi" nota="este mês" />
                {visao.categorias.map((c, i) => (
                  <motion.div
                    key={c.nome}
                    className="row"
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ ...CURVA, delay: Math.min(i, 6) * 0.04 }}
                  >
                    {/* Nome escrito ao lado da barra: a cor identifica, mas nunca
                        sozinha — sob daltonismo duas destas ficam próximas. */}
                    <span className="note" style={{ width: 92, flex: 'none' }}>{c.nome}</span>
                    <div style={{ flex: 1, height: 9, borderRadius: 5, background: 'var(--linha-suave)', overflow: 'hidden' }}>
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.max(c.pct, 3)}%` }}
                        transition={{ ...CURVA, delay: 0.1 + Math.min(i, 6) * 0.04 }}
                        style={{ height: '100%', borderRadius: 5, background: c.cor }}
                      />
                    </div>
                    <b className="num" style={{ fontSize: 12.5, width: 56, textAlign: 'right' }}>{curto(c.valor)}</b>
                  </motion.div>
                ))}
              </>
            )}

            <Titulo texto="Suas obras" nota={String(dados.obras.length)} />
            {dados.obras.map(o => (
              <button key={o.id} className="li" onClick={() => abrirObra(o.id)}>
                <div style={{ flex: 1 }}>
                  <b style={{ fontSize: 13.5 }}>{o.nome}</b>
                  <div className="note">
                    {o.status === 'encerrada' ? 'encerrada' : `${o.contas.pct}% recebido`} · falta{' '}
                    <span className="num">{curto(o.contas.aberto)}</span>
                  </div>
                </div>
                <span className="chip">{o.status === 'encerrada' ? '✓' : `${o.contas.pct}%`}</span>
              </button>
            ))}

            {visao.ultimos.length > 0 && (
              <>
                <Titulo texto="Último movimento" nota="todas as obras" />
                {visao.ultimos.map(l => (
                  <div className="row" key={l.id}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span className="note" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {l.descricao}
                      </span>
                      <span className="note" style={{ fontSize: 11 }}>
                        <span className="num">{dataCurta(l.data)}</span> · {l.obra?.nome ?? 'obra'}
                      </span>
                    </div>
                    <b className="num" style={{ fontSize: 13, color: l.tipo === 'saida' ? COR_SAIDA : '#1B8FE8' }}>
                      {l.tipo === 'saida' ? '−' : '+'}{semSimbolo(l.valor)}
                    </b>
                  </div>
                ))}
              </>
            )}

            <div className="ann">
              Os números somam todas as obras que você vê, inclusive as dos seus sócios. O previsto
              mensal de cada obra sai do painel dela.
            </div>
          </>
        )}
      </Tela>
      <TabBar ativa="resumo" />
    </>
  )
}
