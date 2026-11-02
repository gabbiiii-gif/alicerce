import { useEffect, useState, type CSSProperties } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  apagarAditivo, apagarLancamento, carregarComprovante, carregarObra, criarAditivo, listarSocios, registrarEntrada,
  urlComprovante,
} from '../data/api'
import { useAsync, useLargo } from '../lib/hooks'
import { useUsuario } from '../lib/auth'
import { useObraAtual } from '../lib/obraAtual'
import { usePlano } from '../lib/plano'
import { useAviso } from '../components/Toast'
import { curto, dataCurta, fmt, semSimbolo } from '../lib/format'
import { Secao, Tela, TelaCarregando, Vazio } from '../components/Tela'
import { AvisoPlano } from '../components/AvisoPlano'
import { ValorAnimado } from '../components/ValorAnimado'
import { Barra } from '../components/Barra'
import { Sheet } from '../components/Sheet'
import { MoedaInput } from '../components/MoedaInput'
import { RepassesSheet } from '../components/RepassesSheet'
import { EditarObraSheet } from '../components/EditarObraSheet'
import { useNovidades } from '../lib/notificacoes'
import { AnimatePresence, m } from 'motion/react'
import { CURVA } from '../lib/animacao'
import type { Aditivo, Lancamento, Profile } from '../lib/types'

type SheetAberto = 'entrada' | 'aditivo' | null

// Valor de linha em mono. Num <span>, e não num <b>: o `.scr b` da base troca a fonte do
// negrito pela de título, e o número perderia os dígitos de largura fixa.
const VALOR: CSSProperties = { fontSize: 14, fontWeight: 500, flex: 'none' }
// As folhas ficam fora do .scr, onde o `.scr b` não chega: o negrito das linhas vai aqui.
const TITULO_LINHA: CSSProperties = { fontFamily: 'var(--fonte-titulo)', fontWeight: 500, fontSize: 14 }

export function Painel() {
  const { obraId = '' } = useParams()
  const navigate = useNavigate()
  const { userId, perfil } = useUsuario()
  const { definir } = useObraAtual()
  const { vale } = usePlano()
  const avisar = useAviso()
  const largo = useLargo()

  // Os sócios vêm junto: a entrada pergunta quem recebeu o dinheiro, e sócio lança na obra sem
  // estar em obra_membros (0003).
  const { dados, carregando, erro, recarregar } = useAsync(async () => {
    const [completa, socios] = await Promise.all([carregarObra(obraId), listarSocios().catch(() => [] as Profile[])])
    return { ...completa, socios }
  }, [obraId])

  // O sócio mexeu nesta obra (ou na sociedade, que decide quem vê o quê): os números se
  // refazem na tela aberta. Se ele apagou a obra, não há mais o que mostrar aqui.
  useNovidades(novas => {
    const daqui = novas.filter(n => n.obra_id === obraId || !n.obra_id)
    if (!daqui.length) return
    if (daqui.some(n => n.tipo === 'obra_apagada' && n.obra_id === obraId)) {
      navigate('/obras', { replace: true })
      return
    }
    recarregar()
  })
  const [sheet, setSheet] = useState<SheetAberto>(null)
  const [valor, setValor] = useState(0)
  const [descricao, setDescricao] = useState('')
  const [recebedorId, setRecebedorId] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [selecionado, setSelecionado] = useState<Lancamento | null>(null)
  const [verAditivos, setVerAditivos] = useState(false)
  const [verRepasses, setVerRepasses] = useState(false)
  const [editando, setEditando] = useState(false)
  // Remover muda o total da obra: o primeiro toque só arma, o segundo remove.
  const [removerId, setRemoverId] = useState<string | null>(null)
  const [removendo, setRemovendo] = useState(false)
  const [notaUrl, setNotaUrl] = useState<string | null>(null)

  useEffect(() => {
    if (obraId) definir(obraId)
  }, [obraId, definir])

  // O link da nota é buscado ao abrir o lançamento, não no toque do botão: aberto depois de
  // um await, o navegador trata como pop-up e bloqueia. Nota lançada é visível para todo
  // mundo da obra (0015), então vale também para o lançamento do sócio.
  useEffect(() => {
    setNotaUrl(null)
    if (!selecionado?.comprovante_id) return
    let ativo = true
    carregarComprovante(selecionado.comprovante_id)
      .then(c => urlComprovante(c.storage_path))
      .then(url => ativo && setNotaUrl(url))
      .catch(() => {})
    return () => {
      ativo = false
    }
  }, [selecionado])

  // Só a primeira carga troca a tela pelo esqueleto. Recarregar depois de lançar mantém os
  // números na tela e deixa eles andarem até o valor novo, em vez de piscar a tela inteira.
  if (carregando && !dados) return <TelaCarregando />
  if (erro || !dados) {
    return (
      <Tela titulo="Obra" voltar="/obras">
        <div className="ann">Não deu para abrir a obra: {erro}</div>
        <button className="bt" onClick={() => recarregar()}>Tentar de novo</button>
      </Tela>
    )
  }

  const { obra, lancamentos, contas } = dados

  // Quem pode ter recebido o dinheiro: os membros da obra e os sócios, a pessoa primeiro.
  const pessoasMapa = new Map<string, Profile>()
  if (perfil) pessoasMapa.set(userId, perfil)
  dados.membros.forEach(mb => pessoasMapa.set(mb.user_id, mb.profile))
  dados.socios.forEach(s => pessoasMapa.set(s.id, s))
  const pessoas = [...pessoasMapa.values()]
  // `reserva`: o nome que veio junto com o lançamento, para quem já saiu da sociedade.
  const nomeDe = (id: string, reserva?: string) =>
    id === userId ? 'você' : (pessoasMapa.get(id)?.nome ?? reserva ?? '').split(' ')[0] || 'sócio'
  // Com quem ficou o dinheiro de uma entrada: quem a 0020 marcou, ou quem lançou.
  const comQuem = (l: Lancamento) =>
    l.recebido_por && l.recebido_por !== l.autor_id ? nomeDe(l.recebido_por) : nomeDe(l.autor_id, l.autor?.nome)

  function abrirSheet(qual: Exclude<SheetAberto, null>) {
    setValor(0)
    setDescricao('')
    // Sozinho na obra, o dinheiro só pode ter ficado com a pessoa. Com sócio, ela escolhe:
    // marcar errado é o que bagunça o caixa de cada um.
    setRecebedorId(pessoas.length === 1 ? userId : null)
    setSheet(qual)
  }

  async function salvar() {
    if (valor <= 0) return avisar(sheet === 'aditivo' ? 'Informe o valor do aditivo' : 'Informe o valor recebido')
    if (sheet === 'entrada' && !recebedorId) return avisar('Diga com quem ficou o dinheiro')
    setSalvando(true)
    try {
      if (sheet === 'aditivo') {
        await criarAditivo({ obraId, autorId: userId, descricao, valor })
        avisar('Aditivo somado ao total')
      } else {
        await registrarEntrada({ obraId, autorId: userId, valor, descricao, recebidoPor: recebedorId })
        avisar(recebedorId === userId ? 'Entrada registrada no seu caixa' : `Entrada registrada no caixa de ${nomeDe(recebedorId!)}`)
      }
      setSheet(null)
      await recarregar()
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'não deu para salvar')
    } finally {
      setSalvando(false)
    }
  }

  async function removerAditivo(aditivo: Aditivo) {
    if (removerId !== aditivo.id) return setRemoverId(aditivo.id)
    setRemovendo(true)
    try {
      await apagarAditivo(aditivo.id)
      setRemoverId(null)
      avisar('Aditivo removido do total')
      await recarregar()
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'não deu para remover')
    } finally {
      setRemovendo(false)
    }
  }

  async function apagar(lancamento: Lancamento) {
    try {
      await apagarLancamento(lancamento.id)
      setSelecionado(null)
      avisar('Lançamento apagado')
      await recarregar()
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'não deu para apagar')
    }
  }

  const temAditivos = dados.aditivos.length > 0

  return (
    <>
      <Tela titulo={obra.nome} voltar="/obras" contas largura="larga">
        <AvisoPlano />
        <div className="grade">
          <div className="coluna">
            <div className="cd" style={{ borderRadius: 20, padding: '16px 18px', gap: 9 }}>
              <div className="conta">
                <span>Valor fechado</span>
                <b>{fmt(obra.valor_fechado)}</b>
              </div>
              {/* Tocável para ver e remover: um aditivo lançado errado inflava o total para sempre. */}
              <button
                className="conta"
                onClick={() => {
                  setRemoverId(null)
                  setVerAditivos(true)
                }}
                disabled={!temAditivos}
                style={{
                  width: '100%',
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  fontFamily: 'inherit',
                  color: 'inherit',
                  textAlign: 'left',
                  cursor: temAditivos ? 'pointer' : 'default',
                }}
              >
                <span>
                  + aditivos ({dados.aditivos.length}){temAditivos && <span style={{ color: 'var(--azul-700)' }}> · ver</span>}
                </span>
                <b style={{ color: 'var(--azul-700)' }}>{fmt(contas.aditivos)}</b>
              </button>
              <div className="conta total" style={{ paddingTop: 10, fontSize: 15 }}>
                <span>Total</span>
                {/* Conta até o valor: é o número principal da tela, e a contagem faz o olho pousar nele.
                    Encolhe um pouco nos celulares estreitos para um total de seis dígitos caber na linha. */}
                <ValorAnimado
                  className="num"
                  valor={contas.total}
                  formatar={fmt}
                  style={{ fontSize: 'clamp(24px, 8vw, 30px)', fontWeight: 500, letterSpacing: '-.03em', lineHeight: 1 }}
                />
              </div>
              <div style={{ paddingTop: 4 }}>
                <Barra pct={contas.pct} cor="var(--navy)" />
              </div>
              <div className="row" style={{ fontSize: 13, color: 'var(--texto-secundario)' }}>
                <span>Recebido <span className="num" style={{ color: 'var(--navy)' }}>{curto(contas.recebido)}</span></span>
                <span>Em aberto <span className="num" style={{ color: 'var(--navy)' }}>{fmt(contas.aberto)}</span></span>
              </div>
            </div>

            {/* Logo abaixo dos números, e não no fim da lista: lá eles iam descendo a cada
                lançamento até sair da tela. Desligados sem plano: a policy de insert vai recusar
                de qualquer jeito, e é melhor a pessoa ver o botão apagado com a faixa explicando
                do que preencher o lançamento inteiro para levar um erro de banco no fim. */}
            <div className="par">
              <button className="bt" style={{ paddingInline: 8 }} disabled={!vale} onClick={() => abrirSheet('entrada')}>+ entrada</button>
              <button className="bt" style={{ paddingInline: 8 }} disabled={!vale} onClick={() => abrirSheet('aditivo')}>+ aditivo</button>
              <button className="bt bta" style={{ paddingInline: 8 }} disabled={!vale} onClick={() => navigate(`/obra/${obraId}/enviar`)}>+ saída</button>
            </div>

            {/* No celular, uma fila só que rola de lado, como no protótipo. No desktop a fila
                quebra: rolar de lado sem barra à vista é coisa de dedo, e com mouse o
                "Encerrar" ficaria escondido além da borda da coluna. */}
            <div className="tiras" style={largo ? { gap: 8, flexWrap: 'wrap', overflowX: 'visible' } : { gap: 8 }}>
              <button className="chip" onClick={() => setVerRepasses(true)}>
                Repasses{dados.repasses.length > 0 ? ` (${dados.repasses.length})` : ''}
              </button>
              <button className="chip" onClick={() => navigate(`/obra/${obraId}/notas`)}>Notas fiscais</button>
              <button className="chip" onClick={() => navigate(`/obra/${obraId}/equipe`)}>Equipe</button>
              <button className="chip" onClick={() => navigate(`/obra/${obraId}/categorias`)}>Categorias</button>
              <button className="chip" onClick={() => setEditando(true)}>Editar obra</button>
              <button className="chip" onClick={() => navigate(`/obra/${obraId}/encerrar`)}>Encerrar</button>
            </div>
          </div>

          <div className="coluna">
            <Secao
              titulo="Lançamentos da obra"
              nota={<>Saídas <span className="num" style={{ color: 'var(--navy)' }}>{fmt(contas.saidas)}</span></>}
            />

            {lancamentos.length > 0 ? (
              <div className="lista">
                {lancamentos.map((l, i) => (
                  // Em cascata, não todos de uma vez. O atraso para no oitavo item: numa obra
                  // com cem lançamentos, esperar a cascata inteira seria pior que não ter.
                  <m.button
                    key={l.id}
                    className="linha"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...CURVA, delay: Math.min(i, 8) * 0.035 }}
                    onClick={() => setSelecionado(l)}
                  >
                    <span className="linha-txt">
                      <b style={{ fontSize: 14 }}>{l.descricao}</b>
                      <span className="note">
                        {(l.categoria?.nome || 'entrada') + ' · ' + dataCurta(l.data) + ' · ' +
                          (l.tipo === 'entrada'
                            ? 'com ' + comQuem(l)
                            : l.autor_id === userId ? 'você' : (l.autor?.nome ?? '').split(' ')[0] || 'equipe')}
                      </span>
                    </span>
                    {/* Entrada em azul, saída em navy: dá para ler a lista pela cor antes do sinal. */}
                    <span className="num" style={{ ...VALOR, color: l.tipo === 'saida' ? 'var(--navy)' : 'var(--azul-700)' }}>
                      {(l.tipo === 'saida' ? '−' : '+') + semSimbolo(l.valor)}
                    </span>
                  </m.button>
                ))}
              </div>
            ) : (
              <Vazio>Nenhum lançamento nesta obra ainda</Vazio>
            )}
          </div>
        </div>
      </Tela>

      <AnimatePresence>
      {sheet && (
        <Sheet aoFechar={() => setSheet(null)}>
          <div className="sheet-titulo">
            <b>{sheet === 'aditivo' ? 'Aditivo' : 'Entrada do cliente'}</b>
            <span className="note">{sheet === 'aditivo' ? 'fora do valor fechado' : 'abate o saldo'}</span>
          </div>
          <MoedaInput
            destaque
            rotulo={sheet === 'aditivo' ? 'Valor do aditivo' : 'Valor recebido'}
            valor={valor}
            aoMudar={setValor}
            autoFocus
          />
          <input
            className="inp"
            aria-label={sheet === 'aditivo' ? 'Motivo do aditivo' : 'Descrição da entrada'}
            placeholder={sheet === 'aditivo' ? 'Motivo (troca de piso…)' : 'Descrição (parcela 3…)'}
            value={descricao}
            onChange={e => setDescricao(e.target.value)}
          />
          {/* Com quem ficou o dinheiro: é por isto que o relatório sabe o caixa de cada um
              e quem repassa a quem no fim da obra. */}
          {sheet === 'entrada' && pessoas.length > 1 && (
            <>
              <span className="note" id="painel-recebedor" style={{ fontSize: 13 }}>Com quem ficou o dinheiro?</span>
              <div role="group" aria-labelledby="painel-recebedor" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {pessoas.map(p => (
                  <button
                    key={p.id}
                    className={recebedorId === p.id ? 'chip on' : 'chip'}
                    aria-pressed={recebedorId === p.id}
                    onClick={() => setRecebedorId(p.id)}
                  >
                    {p.id === userId ? 'Comigo' : p.nome.split(' ')[0] || 'sócio'}
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="ann" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span>{sheet === 'aditivo' ? 'novo total' : 'fica em aberto'}</span>
            <span className="num" style={{ fontSize: 15, fontWeight: 500, color: 'var(--navy)' }}>
              {sheet === 'aditivo' ? fmt(contas.total + valor) : fmt(Math.max(contas.aberto - valor, 0))}
            </span>
          </div>
          <button className="bt btp" onClick={salvar} disabled={salvando}>
            {salvando ? 'salvando…' : sheet === 'aditivo' ? 'Salvar aditivo' : 'Registrar entrada'}
          </button>
        </Sheet>
      )}
      </AnimatePresence>

      <AnimatePresence>
      {selecionado && (
        <Sheet aoFechar={() => setSelecionado(null)}>
          <div className="sheet-titulo" style={{ gap: 10 }}>
            <b style={{ fontSize: 17, minWidth: 0, overflowWrap: 'anywhere' }}>{selecionado.descricao}</b>
            <span className="num" style={{ fontSize: 15, fontWeight: 500, flex: 'none' }}>
              {(selecionado.tipo === 'saida' ? '−' : '+') + fmt(selecionado.valor)}
            </span>
          </div>
          <span className="note" style={{ fontSize: 13, lineHeight: 1.4 }}>
            {(selecionado.categoria?.nome || 'entrada') + ' · ' + dataCurta(selecionado.data) + ' · enviado por ' +
              (selecionado.autor_id === userId ? 'você' : selecionado.autor?.nome ?? 'alguém da equipe')}
            {selecionado.tipo === 'entrada' && ` · dinheiro com ${comQuem(selecionado)}`}
          </span>
          {notaUrl && (
            <a className="bt" href={notaUrl} target="_blank" rel="noreferrer">
              Ver nota fiscal
            </a>
          )}
          {selecionado.autor_id === userId ? (
            <button className="bt" onClick={() => apagar(selecionado)}>Apagar lançamento</button>
          ) : (
            <div className="ann">Só quem lançou pode editar ou apagar.</div>
          )}
          <button className="bt-texto" onClick={() => setSelecionado(null)}>fechar</button>
        </Sheet>
      )}
      </AnimatePresence>

      <AnimatePresence>
      {verAditivos && (
        <Sheet aoFechar={() => setVerAditivos(false)}>
          <div className="sheet-titulo">
            <b>Aditivos</b>
            <span className="num" style={{ fontSize: 15, fontWeight: 500, color: 'var(--azul-700)' }}>{fmt(contas.aditivos)}</span>
          </div>
          {dados.aditivos.length === 0 && <div className="note">Nenhum aditivo nesta obra.</div>}
          {dados.aditivos.length > 0 && (
            <div className="lista">
              {dados.aditivos.map(a => (
                <div key={a.id} className="linha">
                  <span className="linha-txt">
                    <b style={TITULO_LINHA}>{a.descricao}</b>
                    <span className="note">
                      {dataCurta(a.created_at.slice(0, 10)) + ' · ' + (a.autor_id === userId ? 'você' : 'equipe')}
                    </span>
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
                    <span className="num" style={VALOR}>{'+' + semSimbolo(a.valor)}</span>
                    {a.autor_id === userId && (
                      <button
                        className="chip"
                        onClick={() => removerAditivo(a)}
                        disabled={removendo}
                        style={removerId === a.id ? { borderColor: 'var(--alerta-borda)', color: 'var(--alerta)' } : undefined}
                      >
                        {removerId === a.id ? (removendo ? 'removendo…' : 'confirmar') : 'remover'}
                      </button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
          {removerId && (
            <div className="ann ann-alerta">
              Removendo, o total da obra cai para{' '}
              <span className="num">{fmt(contas.total - Number(dados.aditivos.find(a => a.id === removerId)?.valor ?? 0))}</span>.
            </div>
          )}
          <div className="note" style={{ textAlign: 'center' }}>Só quem lançou o aditivo pode remover.</div>
          <button className="bt-texto" onClick={() => setVerAditivos(false)}>fechar</button>
        </Sheet>
      )}
      </AnimatePresence>

      <AnimatePresence>
        {verRepasses && (
          <RepassesSheet
            obraId={obraId}
            userId={userId}
            membros={dados.membros}
            repasses={dados.repasses}
            podeLancar={vale}
            aoFechar={() => setVerRepasses(false)}
            aoMudar={recarregar}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editando && (
          <EditarObraSheet obra={obra} contas={contas} aoFechar={() => setEditando(false)} aoSalvar={recarregar} />
        )}
      </AnimatePresence>

    </>
  )
}
