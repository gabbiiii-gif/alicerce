import { useMemo, useState, type CSSProperties } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AnimatePresence, m } from 'motion/react'
import {
  carregarObra, carregarRelatorioGeral, listarObras, listarSocios, notasDosLancamentos, type NotaDoRelatorio,
} from '../data/api'
import type { Profile } from '../lib/types'
import { useAsync } from '../lib/hooks'
import { useAviso } from '../components/Toast'
import { brParaISO, curto, fmt, hojeISO, isoParaBR } from '../lib/format'
import { montarRelatorio, textoResumo, type Intervalo, type Periodo, type Relatorio } from '../lib/relatorio'
import { baixarOuCompartilhar, gerarPdfRelatorio } from '../lib/pdf'
import { CURVA } from '../lib/animacao'
import { Carregando, Secao, Tela } from '../components/Tela'
import { Barra } from '../components/Barra'
import { Sheet } from '../components/Sheet'
import { CaixaDeCadaUm } from '../components/CaixaDeCadaUm'

const TODAS = 'Todas as obras'

// Valor em mono. Num <b>, a regra `.scr b` (fonte de título) é mais específica que `.num`
// e ganharia dela: a família de dados precisa ir explícita.
const mono = (fontSize: number, extra?: CSSProperties): CSSProperties => ({
  fontFamily: 'var(--fonte-dados)',
  fontWeight: 500,
  fontSize,
  ...extra,
})

// O recorte escolhido sobrevive à troca de obra. A tela é montada de novo a cada endereço
// (App.tsx, `key={location.pathname}`), e o estado local voltava para o padrão: quem olhava o
// mês e tocava em outra obra caía na semana, e o repasse "sumia" da tela.
let recorte: { periodo: Periodo; intervalo: Intervalo | null } = { periodo: 'obra', intervalo: null }

export function Relatorios() {
  // Sem obraId na rota (/relatorios) o relatório é o consolidado; com obraId
  // (/obra/:obraId/relatorios) é o daquela obra isolada.
  const { obraId } = useParams()
  const navigate = useNavigate()
  const avisar = useAviso()
  const [periodo, setPeriodoLocal] = useState<Periodo>(recorte.periodo)
  const [intervalo, setIntervaloLocal] = useState<Intervalo | null>(recorte.intervalo)
  const setPeriodo = (p: Periodo) => {
    recorte = { ...recorte, periodo: p }
    setPeriodoLocal(p)
  }
  const setIntervalo = (i: Intervalo | null) => {
    recorte = { ...recorte, intervalo: i }
    setIntervaloLocal(i)
  }
  const [escolhendo, setEscolhendo] = useState(false)
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')

  // Uma carga só para a tela inteira. As obras servem aos chips e, no consolidado, à soma
  // do "em aberto" — que antes vinha de um segundo select idêntico dentro do relatório.
  const { dados, carregando, erro, recarregar } = useAsync(async () => {
    // Os sócios entram na divisão do acerto mesmo sem lançamento (lib/relatorio.ts).
    const socios = listarSocios().catch(() => [] as Profile[])
    if (obraId) {
      const [obras, uma] = await Promise.all([listarObras(), carregarObra(obraId)])
      return {
        obras,
        nome: uma.obra.nome,
        lancamentos: uma.lancamentos,
        membros: uma.membros,
        repasses: uma.repasses,
        socios: await socios,
        aberto: uma.contas.aberto,
        notas: await notasDosLancamentos(uma.lancamentos.map(l => l.comprovante_id ?? '')),
      }
    }
    const [obras, geral] = await Promise.all([listarObras(), carregarRelatorioGeral()])
    return {
      obras,
      nome: TODAS,
      lancamentos: geral.lancamentos,
      membros: geral.membros,
      repasses: geral.repasses,
      socios: await socios,
      aberto: obras.reduce((soma, o) => soma + o.contas.aberto, 0),
      notas: await notasDosLancamentos(geral.lancamentos.map(l => l.comprovante_id ?? '')),
    }
  }, [obraId])

  const relatorio = useMemo(
    () =>
      dados
        ? montarRelatorio(dados.lancamentos, dados.membros, periodo, new Date(), intervalo, dados.repasses, dados.socios)
        : null,
    [dados, periodo, intervalo],
  )

  // Tela e TabBar ficam montadas em todo estado — o padrão de Obras.tsx. Devolver só um
  // spinner deixava quem caísse aqui sem abas para sair: bastava a resposta não chegar
  // (sinal caindo, conexão pendurada, sem rejeitar) para prender a pessoa até matar o app.
  if (!dados || !relatorio) {
    return (
      <>
        <Tela titulo="Relatório" largura="larga">
          {carregando && <Carregando />}
          {erro && !carregando && (
            <>
              <div className="ann ann-alerta">Não deu para montar o relatório: {erro}</div>
              <button className="bt" onClick={() => recarregar()}>Tentar de novo</button>
            </>
          )}
        </Tela>
      </>
    )
  }

  const { obras, nome, aberto } = dados
  const rotulo =
    periodo === 'obra' ? (obraId ? 'Obra toda' : 'Tudo') : periodo === 'semana' ? 'Semana' : periodo === 'mes' ? 'Mês' : 'Período'

  async function exportarPdf() {
    try {
      // Links de um ano: o PDF é mandado adiante e aberto dias depois, quando o link de
      // uma hora que a tela usa já teria vencido.
      const notasPdf = await notasDosLancamentos(
        relatorio!.porPessoa.flatMap(p => p.itens.map(i => i.comprovanteId ?? '')),
        60 * 60 * 24 * 365,
      )
      const blob = await gerarPdfRelatorio(nome, relatorio!, aberto, rotulo, notasPdf)
      const resultado = await baixarOuCompartilhar(
        blob,
        `alicerce-${nome.toLowerCase().replace(/\s+/g, '-')}-${relatorio!.inicio}.pdf`,
        `Relatório ${nome}`,
      )
      avisar(resultado === 'compartilhado' ? 'PDF compartilhado' : 'PDF salvo')
    } catch {
      avisar('não deu para gerar o PDF')
    }
  }

  // Abre a folha já preenchida: com o intervalo em uso, se houver; senão do dia 1 do mês
  // até hoje, que é o recorte que mais se pede. Folha em branco obrigaria a digitar duas
  // datas completas antes de ver qualquer coisa.
  function abrirEscolha() {
    if (intervalo) {
      setDe(isoParaBR(intervalo.inicio))
      setAte(isoParaBR(intervalo.fim))
    } else {
      const hoje = hojeISO()
      setDe(isoParaBR(`${hoje.slice(0, 8)}01`))
      setAte(isoParaBR(hoje))
    }
    setEscolhendo(true)
  }

  function aplicarPeriodo() {
    const inicio = brParaISO(de)
    const fim = brParaISO(ate)
    if (!inicio || !fim) return avisar('Datas no formato dia/mês/ano')
    // Não conferimos qual é a maior: periodoDe ordena. Recusar "de 20 a 14" seria exigir
    // que a pessoa entendesse a ordem em vez de entregar o que ela quis pedir.
    setIntervalo({ inicio, fim })
    setPeriodo('personalizado')
    setEscolhendo(false)
  }

  function mandarWhatsApp() {
    const texto = textoResumo(nome, relatorio!, aberto)
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank')
  }

  const emAbertoRotulo = `em aberto${!obraId && obras && obras.length > 1 ? ' (soma)' : ''}`

  return (
    <>
      <Tela
        titulo="Relatório"
        largura="larga"
        acao={<span className="note" style={{ fontSize: 13, flex: 'none' }}>{rotulo}</span>}
      >
        {erro && (
          <div className="ann ann-alerta">
            Não deu para atualizar: {erro}{' '}
            <a href="#" style={{ color: 'inherit' }} onClick={e => { e.preventDefault(); recarregar() }}>Tentar de novo</a>
          </div>
        )}

        {/* Escolha do recorte: tudo junto, ou uma obra de cada vez. */}
        <div className="tiras" role="group" aria-label="Obra" style={{ gap: 8 }}>
          <button
            className={!obraId ? 'chip on' : 'chip'}
            aria-pressed={!obraId}
            onClick={() => navigate('/relatorios')}
          >
            Todas
          </button>
          {(obras ?? []).map(o => (
            <button
              key={o.id}
              className={obraId === o.id ? 'chip on' : 'chip'}
              aria-pressed={obraId === o.id}
              onClick={() => navigate(`/obra/${o.id}/relatorios`)}
            >
              {o.nome}
            </button>
          ))}
        </div>

        <div className="seg" role="group" aria-label="Período">
          <button className={periodo === 'obra' ? 'on' : undefined} aria-pressed={periodo === 'obra'} onClick={() => setPeriodo('obra')}>
            {obraId ? 'Obra toda' : 'Tudo'}
          </button>
          <button className={periodo === 'semana' ? 'on' : undefined} aria-pressed={periodo === 'semana'} onClick={() => setPeriodo('semana')}>
            Semana
          </button>
          <button className={periodo === 'mes' ? 'on' : undefined} aria-pressed={periodo === 'mes'} onClick={() => setPeriodo('mes')}>
            Mês
          </button>
          {/* Tocar aqui já abre a escolha, mesmo com o período ativo: é assim que se troca
              as datas sem ter que passar por outra aba e voltar. */}
          <button
            className={periodo === 'personalizado' ? 'on' : undefined}
            aria-pressed={periodo === 'personalizado'}
            aria-haspopup="dialog"
            onClick={abrirEscolha}
          >
            {periodo === 'personalizado' ? 'Período' : 'Escolher'}
          </button>
        </div>

        <div className="row" style={{ alignItems: 'baseline', paddingTop: 4 }}>
          <b style={{ fontSize: 18, letterSpacing: '-.015em', minWidth: 0 }}>{nome}</b>
          <span className="note" style={{ fontSize: 13, flex: 'none' }}>{relatorio.titulo}</span>
        </div>

        {/* Duas colunas no desktop: à esquerda as contas do período, à direita quem gastou o
            quê e com quem o dinheiro está. No celular vira uma coluna só, nessa ordem. */}
        <div className="grade">
          <div className="coluna">
            <div className="cd" style={{ padding: '14px 16px', gap: 8 }}>
              <div className="conta">
                <span>Entradas</span>
                <b className="num" style={{ color: 'var(--azul-700)' }}>+{curto(relatorio.entradas)}</b>
              </div>
              <div className="conta">
                <span>Saídas</span>
                <b className="num">−{fmt(relatorio.saidas)}</b>
              </div>
              <div className="conta total">
                <span>{emAbertoRotulo}</span>
                <b className="num" style={{ fontSize: 20 }}>{fmt(aberto)}</b>
              </div>
            </div>

            {/* Só aparece no consolidado: no relatório de uma obra, a quebra por obra
                seria uma linha só repetindo o título. */}
            {relatorio.porObra.length > 1 && (
              <>
                <Secao titulo="Por obra" nota="No período" />
                <div className="lista">
                  {relatorio.porObra.map((o, i) => (
                    <m.button
                      key={o.id}
                      className="linha"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ ...CURVA, delay: Math.min(i, 8) * 0.035 }}
                      onClick={() => navigate(`/obra/${o.id}/relatorios`)}
                    >
                      <span className="linha-txt">
                        <b style={{ fontSize: 14 }}>{o.nome}</b>
                        <span className="note">entrou {curto(o.entradas)}</span>
                      </span>
                      <b className="num" style={mono(14, { flex: 'none' })}>−{fmt(o.saidas)}</b>
                    </m.button>
                  ))}
                </div>
              </>
            )}

            {relatorio.porCategoria.length > 0 && (
              <>
                <Secao titulo="Por categoria" nota="só saídas" />
                <div className="cd" style={{ padding: '14px 16px', gap: 10 }}>
                  {relatorio.porCategoria.map(c => (
                    <div key={c.nome} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span
                        className="note"
                        style={{ fontSize: 13, width: 96, flex: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                      >
                        {c.nome}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Barra pct={c.pct} />
                      </div>
                      <b className="num" style={mono(12.5, { minWidth: 74, textAlign: 'right', flex: 'none' })}>{curto(c.valor)}</b>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="coluna">
            <Secao titulo="Gastos por pessoa" nota="Nota a nota" />

            <ColunasPessoas relatorio={relatorio} notas={dados.notas} />

            <Repasses relatorio={relatorio} />

            <div className="par" style={{ paddingTop: 4 }}>
              <button className="bt" onClick={exportarPdf}>PDF</button>
              <button className="bt bta" onClick={mandarWhatsApp}>WhatsApp</button>
            </div>

            <div className="ann">
              {obraId
                ? 'O relatório fecha o período desta obra: mesmos lançamentos do painel, somados por pessoa.'
                : 'Todas as suas obras somadas no período. Toque numa obra acima para ver ela sozinha.'}
            </div>
          </div>
        </div>
      </Tela>

      <AnimatePresence>
        {escolhendo && (
          <Sheet aoFechar={() => setEscolhendo(false)}>
            <div className="sheet-titulo">
              <b>Escolher período</b>
              <span className="note">dia/mês/ano</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label className="rotulo">
                De
                <input
                  className="inp"
                  inputMode="numeric"
                  placeholder="dd/mm/aaaa"
                  value={de}
                  onChange={e => setDe(e.target.value)}
                />
              </label>
              <label className="rotulo">
                Até
                <input
                  className="inp"
                  inputMode="numeric"
                  placeholder="dd/mm/aaaa"
                  value={ate}
                  onChange={e => setAte(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && aplicarPeriodo()}
                />
              </label>
            </div>

            <button className="bt btp" onClick={aplicarPeriodo}>Ver este período</button>

            <span className="note" style={{ fontSize: 13, textAlign: 'center', lineHeight: 1.4 }}>
              As duas pontas entram na conta, inclusive o próprio dia escolhido.
            </span>
          </Sheet>
        )}
      </AnimatePresence>

    </>
  )
}

// Uma coluna por pessoa, lado a lado. Cada gasto é um cartão com data e valor no topo, o
// que foi e a categoria embaixo, e a nota fiscal logo abaixo quando ela existe — tocar abre
// o arquivo. Sem nota, o cartão fica só com as informações.
function ColunasPessoas({ relatorio, notas }: { relatorio: Relatorio; notas: Map<string, NotaDoRelatorio> }) {
  // O selo da nota é texto azul pequeno, como no protótipo: ao lado da categoria ele diz
  // "tem NF" sem pesar o cartão, que já tem quatro informações.
  const selo: CSSProperties = { fontSize: 11.5, fontWeight: 600, color: 'var(--azul-700)', textDecoration: 'none', flex: 'none' }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, alignItems: 'start' }}>
      {relatorio.porPessoa.map(p => (
        <div key={p.userId} style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <div
            style={{
              background: 'var(--navy)',
              color: '#fff',
              borderRadius: 12,
              padding: '10px 12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 6,
            }}
          >
            <b style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}</b>
            <b className="num" style={mono(13.5, { flex: 'none' })}>−{curto(p.total)}</b>
          </div>

          {p.itens.length === 0 && <span className="note" style={{ padding: '4px 2px' }}>Sem saídas no período</span>}

          {p.itens.map(i => {
            const nota = i.comprovanteId ? notas.get(i.comprovanteId) : undefined
            const ehFoto = (nota?.mime ?? '').startsWith('image/')
            return (
              <div key={i.id} className="cd" style={{ padding: '10px 12px', gap: 3, borderRadius: 12, minWidth: 0 }}>
                <div className="row" style={{ gap: 6 }}>
                  <span className="num" style={{ fontSize: 11.5, color: 'var(--texto-secundario)' }}>{isoParaBR(i.data)}</span>
                  <b className="num" style={mono(13)}>{fmt(i.valor)}</b>
                </div>
                <b style={{ fontSize: 13, lineHeight: 1.3, overflowWrap: 'anywhere' }}>{i.descricao}</b>
                <div className="row" style={{ gap: 6 }}>
                  <span className="note" style={{ fontSize: 11.5, minWidth: 0 }}>{i.categoria}</span>
                  {nota && (
                    <a href={nota.url} target="_blank" rel="noreferrer" style={selo}>
                      {ehFoto ? 'ver NF' : 'NF em PDF'}
                    </a>
                  )}
                </div>
                {/* A miniatura da foto também abre a nota, mas fica fora do leitor de tela e
                    do Tab: o link "ver NF" logo acima já leva ao mesmo arquivo. */}
                {nota && ehFoto && (
                  <a href={nota.url} target="_blank" rel="noreferrer" tabIndex={-1} aria-hidden="true" style={{ display: 'block', marginTop: 4 }}>
                    <img
                      src={nota.url}
                      alt=""
                      loading="lazy"
                      style={{ width: '100%', height: 72, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--linha)', display: 'block' }}
                    />
                  </a>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

// Repasses entre sócios e com quem o dinheiro está. Fora das contas de cima: repasse não
// é entrada nem saída da obra, o dinheiro só muda de mão.
function Repasses({ relatorio }: { relatorio: Relatorio }) {
  if (!relatorio.repasses.length && !relatorio.comCadaUm.length) return null
  return (
    <>
      {relatorio.repasses.length > 0 && (
        <>
          <Secao
            titulo="Repasses"
            nota={
              <>
                No período <b className="num" style={mono(13, { color: 'var(--navy)' })}>{fmt(relatorio.repassado)}</b>
              </>
            }
          />
          <div className="lista" style={{ padding: '4px 16px' }}>
            {relatorio.repasses.map(r => (
              <div key={r.id} className="linha" style={{ padding: '10px 0', alignItems: 'flex-start' }}>
                <span className="linha-txt">
                  <b style={{ fontSize: 14 }}>
                    {r.de} → {r.para}
                  </b>
                  <span className="note">
                    {[isoParaBR(r.data), r.descricao, r.obra].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <b className="num" style={mono(14, { flex: 'none' })}>{fmt(r.valor)}</b>
              </div>
            ))}
          </div>
        </>
      )}

      <CaixaDeCadaUm relatorio={relatorio} nota={`até ${isoParaBR(relatorio.fim)}`} />
    </>
  )
}
