import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { m } from 'motion/react'
import { carregarRelatorioGeral, listarObras, listarSocios } from '../data/api'
import type { Profile } from '../lib/types'
import { useAsync } from '../lib/hooks'
import { useObraAtual } from '../lib/obraAtual'
import { montarVisao, type MesResumo } from '../lib/dashboard'
import { curto, dataCurta, fmt } from '../lib/format'
import { CURVA } from '../lib/animacao'
import { Carregando, Secao, Tela, Vazio } from '../components/Tela'
import { AvisoPlano } from '../components/AvisoPlano'
import { ValorAnimado } from '../components/ValorAnimado'
import { useNovidades } from '../lib/notificacoes'
import { montarRelatorio } from '../lib/relatorio'
import { CaixaDeCadaUm } from '../components/CaixaDeCadaUm'

// Entrou em azul, saiu em navy, como no desenho da v2. As duas ficam longe em claridade,
// então se separam também para quem tem daltonismo — e a legenda escreve o nome de cada uma.
const COR_ENTROU = 'var(--azul)'
const COR_SAIU = 'var(--navy)'

// O que entrou e o que saiu em cada mês, em barras lado a lado: dá para ver de longe o mês
// em que saiu mais do que entrou, sem ler número nenhum. As duas séries usam a mesma
// escala (o maior mês de qualquer uma), senão a comparação entre elas mentiria.
function EntrouESaiu({ meses, maior }: { meses: MesResumo[]; maior: number }) {
  // Mês com movimento pequeno ainda aparece como um traço; mês vazio fica vazio.
  const altura = (v: number) => (v > 0 ? Math.max((v / maior) * 100, 2) : 0)
  return (
    <div className="cd" style={{ padding: '16px 14px 12px', gap: 10 }}>
      <div aria-hidden="true" style={{ display: 'flex', gap: 8, padding: '0 2px' }}>
        {meses.map((mes, i) => (
          <div
            key={mes.chave}
            style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 3, height: 96, width: '100%' }}>
              {[
                { valor: mes.entradas, cor: COR_ENTROU },
                { valor: mes.saidas, cor: COR_SAIU },
              ].map((barra, j) => (
                // Sobe a partir do chão por escala, e não por altura: a placa de vídeo
                // anima sem recalcular o layout a cada quadro (o mesmo motivo da Barra).
                <m.div
                  key={j}
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ ...CURVA, duration: 0.55, delay: 0.1 + i * 0.04 }}
                  style={{
                    width: '40%',
                    maxWidth: 16,
                    height: `${altura(barra.valor)}%`,
                    borderRadius: '4px 4px 2px 2px',
                    background: barra.cor,
                    transformOrigin: 'bottom',
                  }}
                />
              ))}
            </div>
            <span className="note" style={{ fontSize: 11 }}>{mes.rotulo}</span>
          </div>
        ))}
      </div>
      <div aria-hidden="true" style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
        {[
          { cor: COR_ENTROU, texto: 'entrou' },
          { cor: COR_SAIU, texto: 'saiu' },
        ].map(l => (
          <span key={l.texto} className="note" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <i style={{ width: 9, height: 9, borderRadius: 2, background: l.cor, display: 'block' }} />
            {l.texto}
          </span>
        ))}
      </div>
      {/* Tabela escondida: o mesmo dado em texto, para leitor de tela e para quem
          precisar do número exato que a barra não diz. */}
      <table className="so-leitor">
        <caption>Entradas e saídas por mês</caption>
        <tbody>
          {meses.map(mes => (
            <tr key={mes.chave}>
              <th scope="row">{mes.rotulo}</th>
              <td>entrou {fmt(mes.entradas)}</td>
              <td>saiu {fmt(mes.saidas)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Resumo() {
  const navigate = useNavigate()
  const { definir } = useObraAtual()

  const { dados, carregando, erro, recarregar } = useAsync(async () => {
    const [obras, geral, socios] = await Promise.all([
      listarObras(),
      carregarRelatorioGeral(),
      listarSocios().catch(() => [] as Profile[]),
    ])
    return { obras, ...geral, socios }
  }, [])

  // O sócio lançou em qualquer obra: os números daqui mudam, então a tela se refaz sozinha.
  useNovidades(() => recarregar())

  const visao = useMemo(() => (dados ? montarVisao(dados.obras, dados.lancamentos) : null), [dados])
  // O caixa de cada sócio somando todas as obras, logo na primeira tela: é a primeira coisa
  // que o sócio procura ao abrir o app (reunião de 19/10/2026).
  const caixas = useMemo(
    () =>
      dados ? montarRelatorio(dados.lancamentos, dados.membros, 'obra', new Date(), null, dados.repasses, dados.socios) : null,
    [dados],
  )

  if (!dados || !visao) {
    return (
      <Tela titulo="Resumo" marca contas largura="larga">
        {carregando && <Carregando />}
        {erro && !carregando && (
          <>
            <div className="ann">Não deu para montar o resumo: {erro}</div>
            <button className="bt" onClick={() => recarregar()}>Tentar de novo</button>
          </>
        )}
      </Tela>
    )
  }

  const noVermelho = visao.margem < 0
  // No vermelho o cartão inteiro troca de tom, e os rótulos acompanham: o azul claro
  // sobre o marrom brigava com o fundo.
  const tom = noVermelho ? { color: '#FDBA74' } : undefined
  // A barra de cada categoria é medida contra a maior delas, e não contra o total do mês:
  // a mais cara enche a trilha e as outras se comparam com ela.
  const maiorCategoria = Math.max(1, ...visao.categorias.map(c => c.valor))

  function abrirObra(id: string) {
    definir(id)
    navigate(`/obra/${id}`)
  }

  return (
    <Tela titulo="Resumo" marca contas largura="larga">
      <AvisoPlano />
      {dados.obras.length === 0 ? (
        <Vazio>
          nada para resumir ainda
          <br />
          <span style={{ fontSize: 12 }}>Cadastre uma obra para ver seus números aqui</span>
        </Vazio>
      ) : (
        <div className="grade">
          <div className="coluna">
            {/* A margem vem primeiro, e não o faturamento: é ela que diz se a obra se
                paga hoje. Negativa significa tocar a obra com dinheiro que ainda não
                entrou — a informação que mais cedo muda uma decisão. */}
            <m.div
              className="heroi"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={CURVA}
              style={noVermelho ? { background: '#7C2D12' } : undefined}
            >
              <span className="heroi-rotulo" style={tom}>
                {noVermelho ? 'no vermelho — gasto maior que o recebido' : 'sobra em caixa (recebido − gasto)'}
              </span>
              <ValorAnimado
                className="heroi-valor"
                valor={Math.abs(visao.margem)}
                formatar={v => (noVermelho ? '−' : '') + fmt(v)}
              />
              <span className="heroi-rotulo" style={tom}>
                {visao.mesesDeFolego !== null
                  ? `dá para ${visao.mesesDeFolego.toFixed(1).replace('.', ',')} ${visao.mesesDeFolego < 2 ? 'mês' : 'meses'} no ritmo atual`
                  : // O "a receber" agora tem bloco próprio logo abaixo; aqui fica só a contagem.
                    `${visao.obrasAtivas} ${visao.obrasAtivas === 1 ? 'obra em andamento' : 'obras em andamento'}`}
              </span>
              <div className="heroi-blocos">
                {[
                  { rotulo: 'a receber', valor: fmt(visao.aberto) },
                  { rotulo: 'ritmo mensal', valor: fmt(visao.ritmoMensal) },
                ].map((item, i) => (
                  <m.div
                    key={item.rotulo}
                    className="heroi-bloco"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...CURVA, delay: 0.05 + i * 0.05 }}
                  >
                    <span style={tom}>{item.rotulo}</span>
                    <b>{item.valor}</b>
                  </m.div>
                ))}
              </div>
            </m.div>

            {caixas && <CaixaDeCadaUm relatorio={caixas} nota="todas as obras" />}

            <Secao titulo="Entrou e saiu" nota="últimos 6 meses" />
            <EntrouESaiu meses={visao.meses} maior={visao.maiorMes} />

            <div className="cd" style={{ padding: '12px 16px', gap: 7 }}>
              <div className="conta">
                <span>Entrou este mês</span>
                <b style={{ color: 'var(--azul-700)' }}>+{fmt(visao.mesEntradas)}</b>
              </div>
              <div className="conta">
                <span>Saiu este mês</span>
                <b>−{fmt(visao.mesSaidas)}</b>
              </div>
              <div className="conta total">
                <span>Do contrato já executado</span>
                <b>{visao.executadoPct}%</b>
              </div>
            </div>
          </div>

          <div className="coluna">
            {visao.categorias.length > 0 && (
              <>
                <Secao titulo="Onde o dinheiro foi" nota="este mês" />
                <div className="cd" style={{ padding: '14px 16px', gap: 10 }}>
                  {visao.categorias.map((c, i) => (
                    <m.div
                      key={c.nome}
                      style={{ display: 'flex', alignItems: 'center', gap: 10 }}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ ...CURVA, delay: Math.min(i, 6) * 0.04 }}
                    >
                      {/* Nome escrito ao lado da barra: a cor identifica, mas nunca
                          sozinha — sob daltonismo duas destas ficam próximas. */}
                      <span
                        className="note"
                        style={{ fontSize: 13, width: 96, flex: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                      >
                        {c.nome}
                      </span>
                      <div style={{ flex: 1, height: 9, borderRadius: 5, background: 'var(--linha-suave)', overflow: 'hidden' }}>
                        <m.div
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.max((c.valor / maiorCategoria) * 100, 3)}%` }}
                          transition={{ ...CURVA, delay: 0.1 + Math.min(i, 6) * 0.04 }}
                          style={{ height: '100%', borderRadius: 5, background: c.cor }}
                        />
                      </div>
                      <span className="num" style={{ fontSize: 12.5, fontWeight: 500, minWidth: 74, flex: 'none', textAlign: 'right' }}>
                        {curto(c.valor)}
                      </span>
                    </m.div>
                  ))}
                </div>
              </>
            )}

            <Secao titulo="Suas obras" nota={String(dados.obras.length)} />
            <div className="lista">
              {dados.obras.map(o => {
                const encerrada = o.status === 'encerrada'
                return (
                  <button
                    key={o.id}
                    className="linha"
                    onClick={() => abrirObra(o.id)}
                    style={encerrada ? { opacity: 0.72 } : undefined}
                  >
                    <span className="linha-txt">
                      <b style={{ fontSize: 14 }}>{o.nome}</b>
                      <span className="note">
                        {encerrada ? 'encerrada' : `${o.contas.pct}% recebido`}
                        {/* Encerrada e quitada não tem o que faltar; encerrada com saldo
                            ainda mostra quanto o cliente deve. */}
                        {(!encerrada || o.contas.aberto > 0) && (
                          <>
                            {' '}· falta <span className="num">{curto(o.contas.aberto)}</span>
                          </>
                        )}
                      </span>
                    </span>
                    <span
                      className="chip chip-num"
                      style={encerrada ? { background: 'var(--fundo)', color: 'var(--texto-secundario)' } : undefined}
                    >
                      {encerrada ? 'encerrada' : `${o.contas.pct}%`}
                    </span>
                  </button>
                )
              })}
            </div>

            {visao.ultimos.length > 0 && (
              <>
                <Secao titulo="Último movimento" nota="todas as obras" />
                <div className="lista" style={{ padding: '4px 16px' }}>
                  {visao.ultimos.map(l => (
                    <div className="linha" key={l.id} style={{ padding: '10px 0' }}>
                      <span className="linha-txt">
                        <span style={{ fontSize: 13.5 }}>{l.descricao}</span>
                        <span className="note" style={{ fontSize: 12 }}>
                          <span className="num">{dataCurta(l.data)}</span> · {l.obra?.nome ?? 'obra'}
                        </span>
                      </span>
                      <span
                        className="num"
                        style={{
                          fontSize: 13.5,
                          fontWeight: 500,
                          flex: 'none',
                          color: l.tipo === 'saida' ? 'var(--navy)' : 'var(--azul-700)',
                        }}
                      >
                        {l.tipo === 'saida' ? '−' : '+'}{fmt(l.valor)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className="ann">
              Os números somam todas as obras que você vê, inclusive as dos seus sócios.
            </div>
          </div>
        </div>
      )}
    </Tela>
  )
}
