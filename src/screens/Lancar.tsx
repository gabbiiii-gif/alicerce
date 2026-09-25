import { useId, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { carregarObra, listarCategorias, registrarSaida } from '../data/api'
import { useAsync } from '../lib/hooks'
import { useUsuario } from '../lib/auth'
import { useAviso } from '../components/Toast'
import { brParaISO, hojeISO, isoParaBR } from '../lib/format'
import { Carregando, Tela } from '../components/Tela'
import { MoedaInput } from '../components/MoedaInput'

// A saída sem nota: mesma ficha do Revisar, sem agente no meio. Serve para a compra que
// não tem comprovante para fotografar e para quem prefere digitar a esperar a leitura.
export function Lancar() {
  // Liga cada rótulo ao seu campo: tocar no rótulo foca o campo, e o leitor de tela diz o nome.
  const campo = useId()
  const { obraId = '' } = useParams()
  const navigate = useNavigate()
  const { userId } = useUsuario()
  const avisar = useAviso()

  const { dados, carregando, erro, recarregar } = useAsync(async () => {
    const { obra } = await carregarObra(obraId)
    const categorias = await listarCategorias(obra.dono_id)
    return { obra, categorias }
  }, [obraId])

  const [fornecedor, setFornecedor] = useState('')
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState(0)
  const [data, setData] = useState(isoParaBR(hojeISO()))
  const [categoriaId, setCategoriaId] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  if (!dados) {
    return (
      <Tela titulo="Lançar na mão" voltar={`/obra/${obraId}/enviar`}>
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

  const { obra, categorias } = dados

  async function confirmar() {
    const dataISO = brParaISO(data)
    if (!fornecedor.trim()) return avisar('Diga de quem é a compra')
    if (valor <= 0) return avisar('Informe o valor')
    if (!dataISO) return avisar('Data no formato dia/mês')

    setSalvando(true)
    try {
      const detalhe = descricao.trim()
      await registrarSaida({
        obraId,
        autorId: userId,
        valor,
        descricao: detalhe ? `${fornecedor.trim()} · ${detalhe}` : fornecedor.trim(),
        categoriaId,
        data: dataISO,
      })
      avisar('Lançado no histórico da obra')
      navigate(`/obra/${obraId}`, { replace: true })
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'não deu para lançar')
      setSalvando(false)
    }
  }

  return (
    <Tela titulo="Lançar na mão" voltar={`/obra/${obraId}/enviar`}>
      <div className="row">
        <span className="chip">sem comprovante</span>
        <span className="note">{obra.nome}</span>
      </div>

      <label className="note" htmlFor={`${campo}-fornecedor`}>Fornecedor</label>
      <input id={`${campo}-fornecedor`} className="inp" value={fornecedor} onChange={e => setFornecedor(e.target.value)} autoFocus />

      <label className="note" htmlFor={`${campo}-descricao`}>Descrição</label>
      <input
        id={`${campo}-descricao`}
        className="inp"
        placeholder="O que foi comprado (opcional)"
        value={descricao}
        onChange={e => setDescricao(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && confirmar()}
      />

      <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <label className="note" htmlFor={`${campo}-valor`}>Valor</label>
          <MoedaInput id={`${campo}-valor`} valor={valor} aoMudar={setValor} />
        </div>
        <div style={{ flex: 1 }}>
          <label className="note" htmlFor={`${campo}-data`}>Data</label>
          <input id={`${campo}-data`} className="inp" inputMode="numeric" placeholder="dd/mm/aaaa" value={data} onChange={e => setData(e.target.value)} />
        </div>
      </div>

      <div className="note">Categoria</div>
      <div className="row" style={{ flexWrap: 'wrap', gap: 6, justifyContent: 'flex-start' }}>
        {categorias.map(c => (
          <button
            key={c.id}
            className={categoriaId === c.id ? 'chip bta' : 'chip'}
            style={categoriaId === c.id ? { background: '#2272CC', borderColor: '#2272CC' } : undefined}
            onClick={() => setCategoriaId(c.id)}
          >
            {c.nome}
          </button>
        ))}
      </div>

      <div className="row" style={{ marginTop: 'auto', gap: 8, paddingTop: 10 }}>
        <button className="bt" style={{ flex: 1 }} onClick={() => navigate(`/obra/${obraId}/enviar`)}>Cancelar</button>
        <button className="bt btp" style={{ flex: 2 }} onClick={confirmar} disabled={salvando}>
          {salvando ? 'lançando…' : 'Lançar saída'}
        </button>
      </div>
    </Tela>
  )
}
