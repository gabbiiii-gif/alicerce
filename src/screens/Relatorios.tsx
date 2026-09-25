import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AnimatePresence, m } from 'motion/react'
import { carregarObra, carregarRelatorioGeral, listarObras, notasDosLancamentos, type NotaDoRelatorio } from '../data/api'
import { useAsync } from '../lib/hooks'
import { useAviso } from '../components/Toast'
import { brParaISO, curto, fmt, hojeISO, isoParaBR, semSimbolo } from '../lib/format'
import { montarRelatorio, textoResumo, type Intervalo, type Periodo, type Relatorio } from '../lib/relatorio'
import { baixarOuCompartilhar, gerarPdfRelatorio } from '../lib/pdf'
import { CURVA } from '../lib/animacao'
import { Carregando, Tela } from '../components/Tela'
import { TabBar } from '../components/TabBar'
import { Barra } from '../components/Barra'
import { Sheet } from '../components/Sheet'

const TODAS = 'Todas as obras'

export function Relatorios() {
  // Sem obraId na rota (/relatorios) o relatório é o consolidado; com obraId
  // (/obra/:obraId/relatorios) é o daquela obra isolada.
  const { obraId } = useParams()
  const navigate = useNavigate()
  const avisar = useAviso()
  const [periodo, setPeriodo] = useState<Periodo>('semana')
  const [intervalo, setIntervalo] = useState<Intervalo | null>(null)
  const [escolhendo, setEscolhendo] = useState(false)
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')

  // Uma carga só para a tela inteira. As obras servem aos chips e, no consolidado, à soma
  // do "em aberto" — que antes vinha de um segundo select idêntico dentro do relatório.
  const { dados, carregando, erro, recarregar } = useAsync(async () => {
    if (obraId) {
      const [obras, uma] = await Promise.all([listarObras(), carregarObra(obraId)])
      return {
        obras,
        nome: uma.obra.nome,
        lancamentos: uma.lancamentos,
        membros: uma.membros,
        repasses: uma.repasses,
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
      aberto: obras.reduce((soma, o) => soma + o.contas.aberto, 0),
      notas: await notasDosLancamentos(geral.lancamentos.map(l => l.comprovante_id ?? '')),
    }
  }, [obraId])

  const relatorio = useMemo(
    () => (dados ? montarRelatorio(dados.lancamentos, dados.membros, periodo, new Date(), intervalo, dados.repasses) : null),
    [dados, periodo, intervalo],
  )

  // Tela e TabBar ficam montadas em todo estado — o padrão de Obras.tsx. Devolver só um
  // spinner deixava quem caísse aqui sem abas para sair: bastava a resposta não chegar
  // (sinal caindo, conexão pendurada, sem rejeitar) para prender a pessoa até matar o app.
  if (!dados || !relatorio) {
    return (
      <>
        <Tela titulo="Relatório" comAbas>
          {carregando && <Carregando />}
          {erro && !carregando && (
            <>
              <div className="ann">Não deu para montar o relatório: {erro}</div>
              <button className="bt" onClick={() => recarregar()}>Tentar de novo</button>
            </>
          )}
        </Tela>
        <TabBar ativa="relatorios" />
      </>
    )
  }

  const { obras, nome, aberto } = dados
  const rotulo = periodo === 'semana' ? 'Semana' : periodo === 'mes' ? 'Mês' : 'Período'

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

  const seg = (ativo: boolean) => ({
    flex: 1,
    textAlign: 'center' as const,
    padding: '4px 4px 6px',
    cursor: 'pointer',
    background: ativo ? '#0A2A6E' : '#fff',
    color: ativo ? '#fff' : '#0A2A6E',
    border: 'none',
    fontFamily: 'var(--fonte-texto)',
    fontSize: 13.5,
  })

  return (
    <>
      <Tela titulo="Relatório" comAbas acao={<span className="note">{rotulo}</span>}>
        {erro && (
          <div className="ann">
            Não deu para atualizar: {erro}{' '}
            <a href="#" onClick={e => { e.preventDefault(); recarregar() }}>Tentar de novo</a>
          </div>
        )}

        {/* Escolha do recorte: tudo junto, ou uma obra de cada vez. */}
        <div className="tiras">
          <button
            className={!obraId ? 'chip bta' : 'chip'}
            style={!obraId ? { background: '#0A2A6E', borderColor: '#0A2A6E' } : undefined}
            onClick={() => navigate('/relatorios')}
          >
            Todas
          </button>
          {(obras ?? []).map(o => (
            <button
              key={o.id}
              className={obraId === o.id ? 'chip bta' : 'chip'}
              style={obraId === o.id ? { background: '#0A2A6E', borderColor: '#0A2A6E' } : undefined}
              onClick={() => navigate(`/obra/${o.id}/relatorios`)}
            >
              {o.nome}
            </button>
          ))}
        </div>

        <div className="row" style={{ border: '1px solid #D5E2F2', borderRadius: 10, overflow: 'hidden', gap: 0 }}>
          <button style={seg(periodo === 'semana')} onClick={() => setPeriodo('semana')}>Semana</button>
          <button style={seg(periodo === 'mes')} onClick={() => setPeriodo('mes')}>Mês</button>
          {/* Tocar aqui já abre a escolha, mesmo com o período ativo: é assim que se troca
              as datas sem ter que passar por outra aba e voltar. */}
          <button style={seg(periodo === 'personalizado')} onClick={abrirEscolha}>
            {periodo === 'personalizado' ? 'Período' : 'Escolher'}
          </button>
        </div>

        <div className="row">
          <b style={{ fontSize: 15 }}>{nome}</b>
          <span className="note">{relatorio.titulo}</span>
        </div>

        <div className="cd">
          <div className="row">
            <span className="note">Entradas</span>
            <b className="num" style={{ fontSize: 14 }}>+{curto(relatorio.entradas)}</b>
          </div>
          <div className="row">
            <span className="note">Saídas</span>
            <b className="num" style={{ fontSize: 14 }}>−{semSimbolo(relatorio.saidas)}</b>
          </div>
          <div className="row" style={{ borderTop: '1px solid #E1EAF6', paddingTop: 5 }}>
            <span style={{ fontSize: 14 }}>em aberto{!obraId && obras && obras.length > 1 ? ' (soma)' : ''}</span>
            <b className="num" style={{ fontSize: 16 }}>{fmt(aberto)}</b>
          </div>
        </div>

        {/* Só aparece no consolidado: no relatório de uma obra, a quebra por obra
            seria uma linha só repetindo o título. */}
        {relatorio.porObra.length > 1 && (
          <>
            <div className="row" style={{ marginTop: 2 }}>
              <span style={{ fontSize: 15, fontWeight: 500, fontFamily: 'var(--fonte-titulo)' }}>Por obra</span>
              <span className="note">No período</span>
            </div>
            {relatorio.porObra.map((o, i) => (
              <m.button
                key={o.id}
                className="li"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...CURVA, delay: Math.min(i, 8) * 0.035 }}
                onClick={() => navigate(`/obra/${o.id}/relatorios`)}
              >
                <div style={{ flex: 1 }}>
                  <b style={{ fontSize: 13.5 }}>{o.nome}</b>
                  <div className="note">entrou {curto(o.entradas)}</div>
                </div>
                <b className="num" style={{ fontSize: 13.5 }}>−{semSimbolo(o.saidas)}</b>
              </m.button>
            ))}
          </>
        )}

        {relatorio.porCategoria.map(c => (
          <div className="row" key={c.nome}>
            <span className="note" style={{ width: 88 }}>{c.nome}</span>
            <div style={{ flex: 1 }}>
              <Barra pct={c.pct} />
            </div>
            <b className="num" style={{ fontSize: 12.5, width: 44, textAlign: 'right' }}>{curto(c.valor)}</b>
          </div>
        ))}

        <div className="row" style={{ marginTop: 2 }}>
          <span style={{ fontSize: 15, fontWeight: 500, fontFamily: 'var(--fonte-titulo)' }}>Gastos por pessoa</span>
          <span className="note">Nota a nota</span>
        </div>

        <ColunasPessoas relatorio={relatorio} notas={dados.notas} />

        <Repasses relatorio={relatorio} />

        <div className="row" style={{ gap: 7, paddingTop: 4 }}>
          <button className="bt" style={{ flex: 1, fontSize: 13.5, padding: 6 }} onClick={exportarPdf}>PDF</button>
          <button className="bt bta" style={{ flex: 1, fontSize: 13.5, padding: 6 }} onClick={mandarWhatsApp}>WhatsApp</button>
        </div>

        <div className="ann">
          {obraId
            ? 'O relatório fecha o período desta obra: mesmos lançamentos do painel, somados por pessoa.'
            : 'Todas as suas obras somadas no período. Toque numa obra acima para ver ela sozinha.'}
        </div>
      </Tela>

      <AnimatePresence>
        {escolhendo && (
          <Sheet aoFechar={() => setEscolhendo(false)}>
            <div className="row">
              <b style={{ fontSize: 17 }}>Escolher período</b>
              <span className="note">dia/mês/ano</span>
            </div>

            <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div className="note">De</div>
                <input
                  className="inp"
                  inputMode="numeric"
                  placeholder="dd/mm/aaaa"
                  value={de}
                  onChange={e => setDe(e.target.value)}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div className="note">Até</div>
                <input
                  className="inp"
                  inputMode="numeric"
                  placeholder="dd/mm/aaaa"
                  value={ate}
                  onChange={e => setAte(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && aplicarPeriodo()}
                />
              </div>
            </div>

            <button className="bt btp" onClick={aplicarPeriodo}>Ver este período</button>

            <div className="note" style={{ textAlign: 'center' }}>
              As duas pontas entram na conta, inclusive o próprio dia escolhido.
            </div>
          </Sheet>
        )}
      </AnimatePresence>

      <TabBar ativa="relatorios" />
    </>
  )
}

// Uma coluna por pessoa, lado a lado. Cada gasto é um cartão com data e valor no topo, o
// que foi e a categoria embaixo, e a nota fiscal logo abaixo quando ela existe — tocar abre
// o arquivo. Sem nota, o cartão fica só com as informações.
function ColunasPessoas({ relatorio, notas }: { relatorio: Relatorio; notas: Map<string, NotaDoRelatorio> }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, alignItems: 'start' }}>
      {relatorio.porPessoa.map(p => (
        <div key={p.userId} style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <div
            style={{
              background: '#0A2A6E',
              color: '#fff',
              borderRadius: 10,
              padding: '8px 10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 6,
            }}
          >
            <b style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}</b>
            <b className="num" style={{ fontSize: 13.5 }}>−{curto(p.total)}</b>
          </div>

          {p.itens.length === 0 && <span className="note" style={{ padding: '4px 2px' }}>Sem saídas no período</span>}

          {p.itens.map(i => {
            const nota = i.comprovanteId ? notas.get(i.comprovanteId) : undefined
            const ehFoto = (nota?.mime ?? '').startsWith('image/')
            return (
              <div key={i.id} className="cd" style={{ padding: 8, gap: 3, minWidth: 0 }}>
                <div className="row" style={{ gap: 4 }}>
                  <span className="note" style={{ fontSize: 11.5 }}>{isoParaBR(i.data)}</span>
                  <b className="num" style={{ fontSize: 13 }}>{semSimbolo(i.valor)}</b>
                </div>
                <b style={{ fontSize: 13, lineHeight: 1.25, overflowWrap: 'anywhere' }}>{i.descricao}</b>
                <span className="note" style={{ fontSize: 11.5 }}>{i.categoria}</span>
                {nota && (
                  <a
                    href={nota.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ display: 'block', marginTop: 4, textDecoration: 'none', color: '#2272CC', fontSize: 12, fontWeight: 600 }}
                  >
                    {ehFoto ? (
                      <img
                        src={nota.url}
                        alt="nota fiscal"
                        loading="lazy"
                        style={{ width: '100%', height: 72, objectFit: 'cover', borderRadius: 6, border: '1px solid #E1EAF6', display: 'block' }}
                      />
                    ) : (
                      <span className="chip" style={{ display: 'inline-block' }}>NF em PDF</span>
                    )}
                    {ehFoto && <span style={{ display: 'block', marginTop: 3 }}>ver NF</span>}
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
          <div className="row" style={{ marginTop: 2 }}>
            <span style={{ fontSize: 15, fontWeight: 500, fontFamily: 'var(--fonte-titulo)' }}>Repasses</span>
            <span className="note">
              No período <b className="num" style={{ color: '#0A2A6E' }}>{fmt(relatorio.repassado)}</b>
            </span>
          </div>
          <div className="cd" style={{ padding: '6px 10px', gap: 0 }}>
            {relatorio.repasses.map((r, idx) => (
              <div
                key={r.id}
                className="row"
                style={{ padding: '6px 0', borderTop: idx ? '1px solid #E1EAF6' : undefined, alignItems: 'flex-start' }}
              >
                <div style={{ minWidth: 0 }}>
                  <b style={{ fontSize: 13.5 }}>
                    {r.de} → {r.para}
                  </b>
                  <div className="note">
                    {[isoParaBR(r.data), r.descricao, r.obra].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <b className="num" style={{ fontSize: 13.5 }}>{semSimbolo(r.valor)}</b>
              </div>
            ))}
          </div>
        </>
      )}

      {relatorio.comCadaUm.length > 0 && (
        <>
          <div className="row" style={{ marginTop: 2 }}>
            <span style={{ fontSize: 15, fontWeight: 500, fontFamily: 'var(--fonte-titulo)' }}>Com cada um</span>
            <span className="note">até {isoParaBR(relatorio.fim)}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
            {relatorio.comCadaUm.map(c => (
              <div key={c.userId} className="cd" style={{ padding: 10, gap: 3 }}>
                <b style={{ fontSize: 14 }}>{c.nome}</b>
                <b className="num" style={{ fontSize: 19, color: '#0A2A6E' }}>{fmt(c.emMaos)}</b>
                <span className="note" style={{ fontSize: 11.5 }}>recebeu do cliente {curto(c.entradas)}</span>
                <span className="note" style={{ fontSize: 11.5 }}>gastou −{curto(c.saidas)}</span>
                {c.enviou > 0 && <span className="note" style={{ fontSize: 11.5 }}>repassou −{curto(c.enviou)}</span>}
                {c.recebeu > 0 && <span className="note" style={{ fontSize: 11.5 }}>recebeu repasse +{curto(c.recebeu)}</span>}
              </div>
            ))}
          </div>
          <div className="note">Repasses não mudam o total da obra: o dinheiro é o mesmo, só muda de mão.</div>
        </>
      )}
    </>
  )
}
