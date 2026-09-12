import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { carregarRelatorioGeral, listarObras } from '../data/api'
import { useAsync } from '../lib/hooks'
import { useUsuario } from '../lib/auth'
import { useObraAtual } from '../lib/obraAtual'
import { montarVisao, COR_ENTRADA, COR_SAIDA } from '../lib/dashboard'
import { curto, dataCurta, fmt, semSimbolo } from '../lib/format'
import { CURVA } from '../lib/animacao'
import { Carregando, Tela, Vazio } from '../components/Tela'
import { TabBar } from '../components/TabBar'
import { ValorAnimado } from '../components/ValorAnimado'
import { Grafico3D } from '../components/Grafico3D'

export function Resumo() {
  const navigate = useNavigate()
  const { perfil } = useUsuario()
  const { definir } = useObraAtual()

  const { dados, carregando, erro, recarregar } = useAsync(async () => {
    const [obras, geral] = await Promise.all([listarObras(), carregarRelatorioGeral()])
    return { obras, lancamentos: geral.lancamentos }
  }, [])

  const visao = useMemo(
    () => (dados ? montarVisao(dados.obras, dados.lancamentos) : null),
    [dados],
  )

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

  const saldoMes = visao.mesEntradas - visao.mesSaidas
  const semNada = dados.obras.length === 0

  function abrirObra(id: string) {
    definir(id)
    navigate(`/obra/${id}`)
  }

  return (
    <>
      <Tela titulo="Resumo" comAbas acao={<div className="av">{perfil?.iniciais ?? '·'}</div>}>
        {semNada ? (
          <Vazio>
            nada para resumir ainda
            <br />
            <span style={{ fontSize: 12 }}>cadastre uma obra para ver seus números aqui</span>
          </Vazio>
        ) : (
          <>
            {/* O número que responde "como estou": o que ainda falta receber, somando
                todas as obras. Tudo o mais na tela é detalhe deste. */}
            <motion.div
              className="cd"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={CURVA}
              style={{ background: 'var(--navy)', borderColor: 'var(--navy)', padding: '14px 14px 12px' }}
            >
              <span className="note" style={{ color: '#9FC4F0' }}>a receber, somando todas as obras</span>
              <ValorAnimado
                className="num"
                valor={visao.aberto}
                formatar={fmt}
                style={{ fontSize: 30, color: '#fff', fontFamily: 'var(--fonte-dados)', letterSpacing: '-.03em' }}
              />
              <span className="note" style={{ color: '#9FC4F0' }}>
                {visao.obrasAtivas} {visao.obrasAtivas === 1 ? 'obra em andamento' : 'obras em andamento'}
                {visao.obrasEncerradas > 0 && ` · ${visao.obrasEncerradas} encerrada${visao.obrasEncerradas > 1 ? 's' : ''}`}
              </span>
            </motion.div>

            <div className="row" style={{ gap: 8, alignItems: 'stretch' }}>
              {[
                { rotulo: 'já recebido', valor: visao.recebido },
                { rotulo: 'já gasto', valor: visao.gasto },
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
                  <b className="num" style={{ fontSize: 17 }}>{fmt(m.valor)}</b>
                </motion.div>
              ))}
            </div>

            {/* Evolução: seis meses lado a lado dizem o ritmo da obra, que nenhum número
                sozinho diz. */}
            <div className="row" style={{ marginTop: 6 }}>
              <span style={{ fontSize: 15, fontWeight: 500, fontFamily: 'var(--fonte-titulo)' }}>Últimos 6 meses</span>
              <span className="note">entrada e saída</span>
            </div>

            <div className="cd" style={{ padding: '10px 8px 6px', gap: 2 }}>
              <Grafico3D meses={visao.meses} maior={visao.maiorMes} />
              {/* Legenda sempre presente com duas séries: a identidade nunca pode
                  depender só da cor. */}
              <div className="row" style={{ justifyContent: 'center', gap: 16, paddingTop: 2 }}>
                {[
                  { cor: COR_ENTRADA, texto: 'entrou' },
                  { cor: COR_SAIDA, texto: 'saiu' },
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
                <span className="note">entrou este mês</span>
                <b className="num" style={{ fontSize: 14, color: COR_ENTRADA }}>+{semSimbolo(visao.mesEntradas)}</b>
              </div>
              <div className="row">
                <span className="note">saiu este mês</span>
                <b className="num" style={{ fontSize: 14, color: COR_SAIDA }}>−{semSimbolo(visao.mesSaidas)}</b>
              </div>
              <div className="row" style={{ borderTop: '1px solid var(--linha)', paddingTop: 5 }}>
                <span style={{ fontSize: 14 }}>saldo do mês</span>
                <b className="num" style={{ fontSize: 16 }}>
                  {saldoMes < 0 ? '−' : '+'}{semSimbolo(Math.abs(saldoMes))}
                </b>
              </div>
            </div>

            {visao.categorias.length > 0 && (
              <>
                <div className="row" style={{ marginTop: 6 }}>
                  <span style={{ fontSize: 15, fontWeight: 500, fontFamily: 'var(--fonte-titulo)' }}>Onde o dinheiro foi</span>
                  <span className="note">este mês</span>
                </div>
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

            <div className="row" style={{ marginTop: 6 }}>
              <span style={{ fontSize: 15, fontWeight: 500, fontFamily: 'var(--fonte-titulo)' }}>Suas obras</span>
              <span className="note">{dados.obras.length}</span>
            </div>
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
                <div className="row" style={{ marginTop: 6 }}>
                  <span style={{ fontSize: 15, fontWeight: 500, fontFamily: 'var(--fonte-titulo)' }}>Último movimento</span>
                  <span className="note">todas as obras</span>
                </div>
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
                    <b className="num" style={{ fontSize: 13, color: l.tipo === 'saida' ? COR_SAIDA : COR_ENTRADA }}>
                      {l.tipo === 'saida' ? '−' : '+'}{semSimbolo(l.valor)}
                    </b>
                  </div>
                ))}
              </>
            )}

            <div className="ann">
              Os números somam todas as obras que você vê, inclusive as dos seus sócios.
            </div>
          </>
        )}
      </Tela>
      <TabBar ativa="resumo" />
    </>
  )
}
