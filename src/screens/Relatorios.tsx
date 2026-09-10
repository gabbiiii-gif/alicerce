import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { carregarObra } from '../data/api'
import { useAsync } from '../lib/hooks'
import { useAviso } from '../components/Toast'
import { curto, fmt, semSimbolo } from '../lib/format'
import { montarRelatorio, textoResumo, type Periodo } from '../lib/relatorio'
import { baixarOuCompartilhar, gerarPdfRelatorio } from '../lib/pdf'
import { Carregando, Tela } from '../components/Tela'
import { TabBar } from '../components/TabBar'
import { Barra } from '../components/Barra'

export function Relatorios() {
  const { obraId = '' } = useParams()
  const avisar = useAviso()
  const { dados, carregando } = useAsync(() => carregarObra(obraId), [obraId])
  const [periodo, setPeriodo] = useState<Periodo>('semana')

  const relatorio = useMemo(
    () => (dados ? montarRelatorio(dados.lancamentos, dados.membros, periodo) : null),
    [dados, periodo],
  )

  if (carregando || !dados || !relatorio) return <Carregando />

  const { obra, contas } = dados
  const rotulo = periodo === 'semana' ? 'Semana' : 'Mês'

  async function exportarPdf() {
    try {
      const blob = await gerarPdfRelatorio(obra, relatorio!, contas.aberto, rotulo)
      const resultado = await baixarOuCompartilhar(
        blob,
        `alicerce-${obra.nome.toLowerCase().replace(/\s+/g, '-')}-${relatorio!.inicio}.pdf`,
        `Relatório ${obra.nome}`,
      )
      avisar(resultado === 'compartilhado' ? 'PDF compartilhado' : 'PDF salvo')
    } catch {
      avisar('não deu para gerar o PDF')
    }
  }

  function mandarWhatsApp() {
    const texto = textoResumo(obra, relatorio!, contas.aberto)
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
    fontFamily: "'Space Grotesk', sans-serif",
    fontSize: 13.5,
  })

  return (
    <>
      <Tela titulo="Relatório" comAbas acao={<span className="note">{obra.nome}</span>}>
        <div className="row" style={{ border: '1px solid #D5E2F2', borderRadius: 10, overflow: 'hidden', gap: 0 }}>
          <button style={seg(periodo === 'semana')} onClick={() => setPeriodo('semana')}>Semana</button>
          <button style={seg(periodo === 'mes')} onClick={() => setPeriodo('mes')}>Mês</button>
        </div>

        <div className="row">
          <b style={{ fontSize: 15 }}>{relatorio.titulo}</b>
          <span className="note">fechado agora</span>
        </div>

        <div className="cd">
          <div className="row">
            <span className="note">entradas</span>
            <b style={{ fontSize: 14 }}>+{curto(relatorio.entradas)}</b>
          </div>
          <div className="row">
            <span className="note">saídas dos dois</span>
            <b style={{ fontSize: 14 }}>−{semSimbolo(relatorio.saidas)}</b>
          </div>
          <div className="row" style={{ borderTop: '1px solid #E1EAF6', paddingTop: 5 }}>
            <span style={{ fontSize: 14 }}>em aberto</span>
            <b style={{ fontSize: 16 }}>{fmt(contas.aberto)}</b>
          </div>
        </div>

        {relatorio.porCategoria.map(c => (
          <div className="row" key={c.nome}>
            <span className="note" style={{ width: 88 }}>{c.nome}</span>
            <div style={{ flex: 1 }}>
              <Barra pct={c.pct} />
            </div>
            <b style={{ fontSize: 12.5, width: 44, textAlign: 'right' }}>{curto(c.valor)}</b>
          </div>
        ))}

        <div className="row" style={{ marginTop: 2 }}>
          <span style={{ fontSize: 15, fontWeight: 500, fontFamily: "'Instrument Sans', sans-serif" }}>Por pessoa</span>
          <span className="note">nota a nota</span>
        </div>

        {relatorio.porPessoa.map(p => (
          <div className="cd" key={p.userId} style={{ padding: '8px 10px', gap: 4 }}>
            <div className="row">
              <div className="row" style={{ gap: 6 }}>
                <div className="av">{p.iniciais}</div>
                <b style={{ fontSize: 14 }}>{p.nome}</b>
              </div>
              <b style={{ fontSize: 14 }}>−{curto(p.total)}</b>
            </div>
            {p.itens.map((i, idx) => (
              <div className="row" key={idx}>
                <span className="note">{i.esquerda}</span>
                <span className="note">{i.direita}</span>
              </div>
            ))}
            {p.itens.length === 0 && <span className="note">sem saídas no período</span>}
          </div>
        ))}

        <div className="row" style={{ gap: 7, paddingTop: 4 }}>
          <button className="bt" style={{ flex: 1, fontSize: 13.5, padding: 6 }} onClick={exportarPdf}>PDF</button>
          <button className="bt bta" style={{ flex: 1, fontSize: 13.5, padding: 6 }} onClick={mandarWhatsApp}>WhatsApp</button>
        </div>

        <div className="ann">O relatório fecha o período: mesmos lançamentos do painel, somados por pessoa.</div>
      </Tela>
      <TabBar ativa="relatorios" />
    </>
  )
}
