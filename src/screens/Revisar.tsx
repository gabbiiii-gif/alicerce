import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  carregarComprovante, carregarObra, descartarComprovante, listarCategorias,
  marcarComprovanteConfirmado, registrarSaida, urlComprovante,
} from '../data/api'
import { useAsync } from '../lib/hooks'
import { useUsuario } from '../lib/auth'
import { useAviso } from '../components/Toast'
import { brParaISO, hojeISO, isoParaBR } from '../lib/format'
import { Carregando, Tela } from '../components/Tela'
import { MoedaInput } from '../components/MoedaInput'

export function Revisar() {
  const { obraId = '', comprovanteId = '' } = useParams()
  const navigate = useNavigate()
  const { userId } = useUsuario()
  const avisar = useAviso()

  const { dados, carregando } = useAsync(async () => {
    const [comprovante, obraCompleta] = await Promise.all([carregarComprovante(comprovanteId), carregarObra(obraId)])
    const categorias = await listarCategorias(obraCompleta.obra.dono_id)
    const url = await urlComprovante(comprovante.storage_path)
    return { comprovante, obra: obraCompleta.obra, categorias, url }
  }, [comprovanteId, obraId])

  const [fornecedor, setFornecedor] = useState('')
  const [valor, setValor] = useState(0)
  const [data, setData] = useState('')
  const [categoriaId, setCategoriaId] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  // Preenche o formulário com o que o agente leu, deixando tudo editável.
  useEffect(() => {
    if (!dados) return
    const lido = dados.comprovante.extraido
    setFornecedor(lido?.fornecedor ?? '')
    setValor(lido?.valor ?? 0)
    setData(isoParaBR(lido?.data ?? hojeISO()))
    const sugerida = dados.categorias.find(c => c.nome.toLowerCase() === (lido?.categoria_sugerida ?? '').toLowerCase())
    setCategoriaId(sugerida?.id ?? null)
  }, [dados])

  if (carregando || !dados) return <Carregando />

  const { comprovante, obra, categorias, url } = dados
  const ehImagem = (comprovante.mime ?? '').startsWith('image/')

  async function confirmar() {
    const dataISO = brParaISO(data)
    if (!fornecedor.trim()) return avisar('Diga de quem é a nota')
    if (valor <= 0) return avisar('Informe o valor da nota')
    if (!dataISO) return avisar('Data no formato dia/mês')

    setSalvando(true)
    try {
      await registrarSaida({
        obraId,
        autorId: userId,
        valor,
        descricao: fornecedor.trim(),
        categoriaId,
        data: dataISO,
        comprovanteId: comprovante.id,
      })
      await marcarComprovanteConfirmado(comprovante.id)
      avisar('Lançado no histórico da obra')
      navigate(`/obra/${obraId}`, { replace: true })
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'não deu para lançar')
      setSalvando(false)
    }
  }

  async function descartar() {
    try {
      await descartarComprovante(comprovante.id, comprovante.storage_path)
      avisar('Descartado')
      navigate(`/obra/${obraId}/enviar`, { replace: true })
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'não deu para descartar')
    }
  }

  return (
    <Tela titulo="Conferir lançamento" voltar={`/obra/${obraId}/enviar`}>
      {ehImagem && url ? (
        <img
          src={url}
          alt="foto da nota"
          style={{ height: 140, width: '100%', objectFit: 'cover', borderRadius: 12, border: '1px solid #E1EAF6', flex: 'none' }}
        />
      ) : (
        <a className="dsh" style={{ height: 104, textDecoration: 'none' }} href={url ?? '#'} target="_blank" rel="noreferrer">
          {url ? 'abrir o arquivo da nota' : 'comprovante indisponível'}
        </a>
      )}

      <div className="row">
        <span className="chip bta" style={{ background: '#1B8FE8', borderColor: '#1B8FE8' }}>
          {comprovante.status === 'erro' ? 'preencha na mão' : 'lido pelo agente'}
        </span>
        <span className="note">{obra.nome}</span>
      </div>

      {comprovante.status === 'erro' && comprovante.erro && <div className="ann">O agente não conseguiu ler: {comprovante.erro}</div>}

      <div className="note">fornecedor</div>
      <input className="inp" value={fornecedor} onChange={e => setFornecedor(e.target.value)} />

      <div className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div className="note">valor</div>
          <MoedaInput valor={valor} aoMudar={setValor} />
        </div>
        <div style={{ flex: 1 }}>
          <div className="note">data</div>
          <input className="inp" inputMode="numeric" placeholder="dd/mm/aaaa" value={data} onChange={e => setData(e.target.value)} />
        </div>
      </div>

      <div className="note">categoria</div>
      <div className="row" style={{ flexWrap: 'wrap', gap: 6, justifyContent: 'flex-start' }}>
        {categorias.map(c => (
          <button
            key={c.id}
            className={categoriaId === c.id ? 'chip bta' : 'chip'}
            style={categoriaId === c.id ? { background: '#1B8FE8', borderColor: '#1B8FE8' } : undefined}
            onClick={() => setCategoriaId(c.id)}
          >
            {c.nome}
          </button>
        ))}
      </div>

      <div className="row" style={{ marginTop: 'auto', gap: 8, paddingTop: 10 }}>
        <button className="bt" style={{ flex: 1 }} onClick={descartar}>Descartar</button>
        <button className="bt btp" style={{ flex: 2 }} onClick={confirmar} disabled={salvando}>
          {salvando ? 'lançando…' : 'Confirmar'}
        </button>
      </div>
    </Tela>
  )
}
