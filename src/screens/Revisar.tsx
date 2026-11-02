import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  carregarComprovante, carregarObra, descartarComprovante, lerDeNovo, listarCategorias,
  marcarComprovanteConfirmado, registrarSaida, urlComprovante,
} from '../data/api'
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

export function Revisar() {
  const { obraId = '', comprovanteId = '' } = useParams()
  const navigate = useNavigate()
  const { userId } = useUsuario()
  const avisar = useAviso()

  const { dados, carregando, erro, recarregar } = useAsync(async () => {
    const [comprovante, obraCompleta] = await Promise.all([carregarComprovante(comprovanteId), carregarObra(obraId)])
    const categorias = await listarCategorias(obraCompleta.obra.dono_id)
    const url = await urlComprovante(comprovante.storage_path)
    return { comprovante, obra: obraCompleta.obra, categorias, url }
  }, [comprovanteId, obraId])

  const [fornecedor, setFornecedor] = useState('')
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState(0)
  const [data, setData] = useState('')
  const [categoriaId, setCategoriaId] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [relendo, setRelendo] = useState(false)

  // Preenche o formulário com o que o agente leu, deixando tudo editável.
  useEffect(() => {
    if (!dados) return
    const lido = dados.comprovante.extraido
    setFornecedor(lido?.fornecedor ?? '')
    setDescricao(lido?.descricao ?? '')
    setValor(lido?.valor ?? 0)
    setData(isoParaBR(lido?.data ?? hojeISO()))
    const sugerida = dados.categorias.find(c => c.nome.toLowerCase() === (lido?.categoria_sugerida ?? '').toLowerCase())
    setCategoriaId(sugerida?.id ?? null)
  }, [dados])

  // Sem isto a tela girava para sempre quando a carga falhava: `erro` nao era lido e
  // `dados` nulo caia no mesmo if do `carregando`, sem cabecalho nem caminho de volta.
  if (!dados) {
    return (
      <Tela titulo="Conferir lançamento" voltar={`/obra/${obraId}/enviar`}>
        {carregando && <Carregando />}
        {erro && !carregando && (
          <>
            <div className="ann ann-alerta">Não deu para abrir o comprovante: {erro}</div>
            <button className="bt" onClick={() => recarregar()}>Tentar de novo</button>
          </>
        )}
      </Tela>
    )
  }

  const { comprovante, obra, categorias, url } = dados
  const ehImagem = (comprovante.mime ?? '').startsWith('image/')

  async function confirmar() {
    const dataISO = brParaISO(data)
    if (!fornecedor.trim()) return avisar('Diga de quem é a nota')
    if (valor <= 0) return avisar('Informe o valor da nota')
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

  // Só recarrega quando a leitura deu certo: recarregar refaz o formulário com o que o agente
  // leu, e apagaria o que a pessoa já tinha digitado se o agente falhasse de novo.
  async function lerOutraVez() {
    setRelendo(true)
    try {
      await lerDeNovo(comprovante.id)
      await recarregar()
      avisar('Nota lida pelo agente — confira os dados')
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'o agente não conseguiu ler')
    } finally {
      setRelendo(false)
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
      {/* A foto abre inteira no navegador, como nas Notas fiscais: no recorte de 150 px
          não dá para ler o valor miúdo da nota. */}
      {ehImagem && url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          style={{
            position: 'relative',
            display: 'block',
            height: 150,
            borderRadius: 16,
            overflow: 'hidden',
            border: '1px solid var(--linha)',
            flex: 'none',
          }}
        >
          <img src={url} alt="foto da nota" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          <span
            style={{
              position: 'absolute',
              right: 8,
              bottom: 8,
              background: 'rgba(255, 255, 255, .92)',
              borderRadius: 999,
              padding: '4px 10px',
              fontSize: 12,
              color: 'var(--azul-700)',
            }}
          >
            toque para ampliar
          </span>
        </a>
      ) : (
        <a
          className="dsh"
          style={{ height: 150, gap: 6, fontSize: 13, textDecoration: 'none' }}
          href={url ?? '#'}
          target="_blank"
          rel="noreferrer"
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 3h12v18l-2-1.5L14 21l-2-1.5L10 21l-2-1.5L6 21z" />
            <path d="M9 8h6M9 11.5h6M9 15h4" />
          </svg>
          {url ? 'abrir o arquivo da nota' : 'comprovante indisponível'}
          {url && <span style={{ fontSize: 12, color: 'var(--azul-700)' }}>toque para abrir</span>}
        </a>
      )}

      <div className="row">
        {/* Só 'pronto' veio do agente. 'lendo' aqui é a nota que travou e o usuário abriu na mão. */}
        {comprovante.status === 'pronto' ? (
          <span className="chip bta" style={AZUL}>lido pelo agente</span>
        ) : (
          <span className="chip">preencha na mão</span>
        )}
        <span className="note" style={{ fontSize: 13 }}>{obra.nome}</span>
      </div>

      {comprovante.status === 'erro' && comprovante.erro && (
        <div className="ann ann-alerta">O agente não conseguiu ler: {comprovante.erro}</div>
      )}

      {/* Nota que falhou (chave vencida, IA fora do ar) ou travou em "lendo": resolvido o
          problema, um toque lê de novo em vez de digitar tudo. */}
      {(comprovante.status === 'erro' || comprovante.status === 'lendo') && (
        <button className="bt" onClick={lerOutraVez} disabled={relendo}>
          {relendo ? 'lendo a nota…' : 'Ler de novo com o agente'}
        </button>
      )}

      {/* O rótulo envolve o campo: tocar nele foca o campo, e o leitor de tela diz o nome. */}
      <label className="rotulo">
        Fornecedor
        <input className="inp" placeholder="De quem é a nota?" value={fornecedor} onChange={e => setFornecedor(e.target.value)} />
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

      {/* Enquanto o agente relê, nada de lançar nem descartar: a resposta dele chegaria
          depois e devolveria à fila uma nota já lançada. */}
      <div className="par" style={{ marginTop: 'auto', paddingTop: 12 }}>
        <button className="bt" style={{ minHeight: 50, borderRadius: 14 }} onClick={descartar} disabled={relendo}>
          Descartar
        </button>
        <button className="bt btp" style={{ flex: 2 }} onClick={confirmar} disabled={salvando || relendo}>
          {salvando ? 'lançando…' : 'Confirmar'}
        </button>
      </div>
    </Tela>
  )
}
