import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { carregarObra, listarCategorias, registrarSaida } from '../data/api'
import { useAsync } from '../lib/hooks'
import { useUsuario } from '../lib/auth'
import { useAviso } from '../components/Toast'
import { brParaISO, hojeISO, isoParaBR } from '../lib/format'
import { Carregando, Tela } from '../components/Tela'
import { MoedaInput } from '../components/MoedaInput'

// Valor e data são dado: em mono, como no resto do app.
const MONO = { fontFamily: 'var(--fonte-dados)', letterSpacing: '-.02em' }
// O `.chip` do CSS vem depois do `.bta` e repõe o fundo branco; o azul vai à mão.
const AZUL = { background: 'var(--azul-700)', borderColor: 'var(--azul-700)' }

// A saída sem nota: mesma ficha do Revisar, sem agente no meio. Serve para a compra que
// não tem comprovante para fotografar e para quem prefere digitar a esperar a leitura.
export function Lancar() {
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
            <div className="ann ann-alerta">Não deu para abrir a obra: {erro}</div>
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
        <span className="note" style={{ fontSize: 13 }}>{obra.nome}</span>
      </div>

      {/* O rótulo envolve o campo: tocar nele foca o campo, e o leitor de tela diz o nome. */}
      <label className="rotulo">
        Fornecedor
        <input
          className="inp"
          placeholder="De quem é a compra?"
          value={fornecedor}
          onChange={e => setFornecedor(e.target.value)}
          autoFocus
        />
      </label>

      <label className="rotulo">
        Descrição
        <input
          className="inp"
          placeholder="O que foi comprado (opcional)"
          value={descricao}
          onChange={e => setDescricao(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && confirmar()}
        />
      </label>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, flex: 'none' }}>
        <label className="rotulo" style={{ minWidth: 0 }}>
          Valor
          <MoedaInput valor={valor} aoMudar={setValor} placeholder="R$ 0,00" style={MONO} />
        </label>
        <label className="rotulo" style={{ minWidth: 0 }}>
          Data
          <input className="inp" inputMode="numeric" placeholder="dd/mm/aaaa" value={data} onChange={e => setData(e.target.value)} style={MONO} />
        </label>
      </div>

      <span className="note">Categoria</span>
      <div role="group" aria-label="Categoria" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, flex: 'none' }}>
        {categorias.map(c => {
          const escolhida = categoriaId === c.id
          return (
            <button
              key={c.id}
              className={escolhida ? 'chip bta' : 'chip'}
              style={escolhida ? AZUL : undefined}
              aria-pressed={escolhida}
              onClick={() => setCategoriaId(c.id)}
            >
              {c.nome}
            </button>
          )
        })}
      </div>

      <div className="par" style={{ marginTop: 'auto', paddingTop: 12 }}>
        <button className="bt" style={{ minHeight: 50, borderRadius: 14 }} onClick={() => navigate(`/obra/${obraId}/enviar`)}>
          Cancelar
        </button>
        <button className="bt btp" style={{ flex: 2 }} onClick={confirmar} disabled={salvando}>
          {salvando ? 'lançando…' : 'Lançar saída'}
        </button>
      </div>
    </Tela>
  )
}
