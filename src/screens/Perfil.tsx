import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence } from 'motion/react'
import { enviarRelatorioPorEmail, listarObras, listarSocios, sairDaSociedade } from '../data/api'
import { useAsync } from '../lib/hooks'
import { useAuth, useUsuario } from '../lib/auth'
import { useObraAtual } from '../lib/obraAtual'
import { usePlano } from '../lib/plano'
import { dataBR } from '../lib/format'
import { useAviso } from '../components/Toast'
import { Tela } from '../components/Tela'
import { Sheet } from '../components/Sheet'
import { useNotificacoes } from '../lib/notificacoes'
import { ehIphone, ehNativo } from '../lib/plataforma'
import type { EstadoPush } from '../lib/push'

type ModuloPush = typeof import('../lib/push')

// Onde a pessoa devolve a permissão que negou, em cada aparelho.
const ondeLiberar = () =>
  ehNativo()
    ? 'Configurações › Apps › Alicerce › Notificações'
    : ehIphone()
      ? 'Ajustes › Notificações › Alicerce'
      : 'nas permissões do site, no cadeado ao lado do endereço'

const nomeDoAviso = () =>
  ehNativo() || /Android|iPhone|iPad|iPod/.test(navigator.userAgent) ? 'Aviso no celular' : 'Aviso neste computador'

// O aviso com o app fechado, em cada situação em que o aparelho pode estar (lib/push.ts).
// Ligado e desligado viram o interruptor; nos outros estados não há o que ligar, e a linha
// fica com a seta (e um rótulo curto quando ele ajuda a entender o que o toque faz).
function textoDoPush(estado: Exclude<EstadoPush, 'sem-suporte'>): { nota: string; rotulo: string } {
  switch (estado) {
    case 'ligado':
      return { nota: ehNativo() ? 'chega mesmo com o app fechado, com o toque do Alicerce' : 'chega mesmo com o app fechado', rotulo: '' }
    case 'desligado':
      return { nota: 'toque para saber na hora o que o sócio lança', rotulo: '' }
    case 'bloqueado':
      return { nota: `bloqueado: libere em ${ondeLiberar()}`, rotulo: '' }
    case 'instalar':
      return { nota: 'no iPhone, só pelo app da Tela de Início: toque para ver como', rotulo: '' }
    case 'atualizar-app':
      return { nota: 'instale a versão nova do app para receber com ele fechado', rotulo: 'atualizar' }
  }
}

// A seta das linhas que levam a outra tela. Decorativa: o texto da linha já diz o destino.
function Seta({ cor = 'var(--placeholder)' }: { cor?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={cor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none' }}>
      <path d="M9 5l7 7-7 7" />
    </svg>
  )
}

// O lado direito de uma linha: um texto curto opcional e, quando a linha leva a algum
// lugar, a seta.
function Lado({ children, seta = true }: { children?: ReactNode; seta?: boolean }) {
  return (
    <span className="note" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, flex: 'none' }}>
      {children}
      {seta && <Seta />}
    </span>
  )
}

// Rótulo de cada grupo de linhas ("Avisos", "Obras"). É um h2 de verdade: quem usa leitor
// de tela pula de grupo em grupo em vez de ouvir a lista inteira.
const GRUPO: CSSProperties = {
  margin: '8px 0 0',
  padding: '0 4px',
  fontFamily: 'var(--fonte-texto)',
  fontSize: 11.5,
  fontWeight: 500,
  letterSpacing: '.08em',
  textTransform: 'uppercase',
  color: 'var(--texto-secundario)',
}

const TITULO_LINHA: CSSProperties = { fontSize: 14.5 }

export function Perfil() {
  const navigate = useNavigate()
  const { session, sair, renomear } = useAuth()
  const [novoNome, setNovoNome] = useState<string | null>(null)
  const [renomeando, setRenomeando] = useState(false)

  async function salvarNome() {
    if (!novoNome?.trim()) return avisar('Escreva seu nome')
    setRenomeando(true)
    try {
      await renomear(novoNome)
      setNovoNome(null)
      avisar('Nome atualizado')
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'não deu para salvar o nome')
    } finally {
      setRenomeando(false)
    }
  }
  const { userId, perfil } = useUsuario()
  const { obraId } = useObraAtual()
  const avisar = useAviso()
  const { naoLidas } = useNotificacoes()
  const [push, setPush] = useState<EstadoPush | null>(null)
  const [mexendoPush, setMexendoPush] = useState(false)
  const modulo = useRef<ModuloPush | null>(null)

  // O módulo do push já fica carregado aqui: no iPhone, ligar precisa acontecer direto no
  // toque, sem esperar download. Confere de novo na volta ao app: a pessoa pode ter liberado a
  // permissão nos ajustes do aparelho e voltado.
  useEffect(() => {
    let ativo = true
    const conferir = () =>
      import('../lib/push')
        .then(m => {
          modulo.current = m
          return m.estadoDoPush()
        })
        .then(estado => ativo && setPush(estado))
        .catch(() => {})
    const aoVoltar = () => document.visibilityState === 'visible' && conferir()
    conferir()
    document.addEventListener('visibilitychange', aoVoltar)
    return () => {
      ativo = false
      document.removeEventListener('visibilitychange', aoVoltar)
    }
  }, [])

  function alternarPush() {
    const m = modulo.current
    if (!m || !push) return
    if (push === 'bloqueado') return avisar(`Libere em ${ondeLiberar()}`)
    if (push === 'atualizar-app') return avisar('Peça o app novo: o aviso com ele fechado só vem na versão nova')
    if (push === 'instalar') {
      return avisar('No Safari, toque em Compartilhar › Adicionar à Tela de Início e abra o Alicerce pelo ícone novo')
    }
    setMexendoPush(true)
    // Chamada direto, sem nada esperado antes: no iPhone, o pedido de permissão só aparece se
    // vier no mesmo toque.
    const pedido = push === 'ligado' ? m.desligarPush() : m.ligarPush()
    pedido
      .then(novo => {
        setPush(novo)
        avisar(novo === 'ligado' ? `${nomeDoAviso()} ligado` : novo === 'bloqueado' ? 'Permissão negada' : `${nomeDoAviso()} desligado`)
      })
      .catch(e => avisar(e instanceof Error ? e.message : 'não deu para mudar o aviso'))
      .finally(() => setMexendoPush(false))
  }
  const { dados, recarregar } = useAsync(async () => {
    const [obras, socios] = await Promise.all([listarObras(), listarSocios()])
    return { obras, socios }
  }, [])
  const obras = dados?.obras
  // Mais de um perfil visível significa que há alguém dividindo as obras comigo: a RLS
  // de profiles só devolve quem divide grupo ou obra.
  const socios = (dados?.socios ?? []).filter(s => s.id !== userId)
  const [saindo, setSaindo] = useState(false)
  const [confirmando, setConfirmando] = useState(false)

  async function desfazer() {
    setSaindo(true)
    try {
      await sairDaSociedade()
      setConfirmando(false)
      avisar('Sociedade desfeita')
      await recarregar()
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'não deu para desfazer')
    } finally {
      setSaindo(false)
    }
  }
  const [enviando, setEnviando] = useState(false)
  const [destino, setDestino] = useState<string | null>(null)

  async function mandarEmail(para?: string) {
    setEnviando(true)
    try {
      const enviado = await enviarRelatorioPorEmail(para)
      setDestino(null)
      avisar(`Resumo enviado para ${enviado}`)
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'não deu para enviar o e-mail')
    } finally {
      setEnviando(false)
    }
  }

  const minhas = obras ?? []
  const souDono = minhas.some(o => o.dono_id === userId)

  // Como está o plano, ao lado de "Plano e cobrança". Mesma fonte e mesmas regras da tela
  // de Plano (convidado não paga). Sem resposta do banco não se diz nada: errar aqui seria
  // dizer "sem plano" a quem pagou só porque a conexão oscilou.
  const { plano, carregando: carregandoPlano, vale, ehCortesia } = usePlano()
  const assinatura = plano?.assinatura ?? null
  const ateCurto = assinatura?.vale_ate ? dataBR(assinatura.vale_ate).slice(0, 5) : null
  const convidado = !!(vale && assinatura?.titular_id && assinatura.titular_id !== userId)
  const estadoDoPlano =
    carregandoPlano || !plano
      ? ''
      : convidado
        ? 'liberado'
        : !vale
          ? 'sem plano'
          : `${ehCortesia ? 'cortesia' : 'pago'}${ateCurto ? ` até ${ateCurto}` : ''}`

  const pushInterruptor = push === 'ligado' || push === 'desligado'

  function abrir(destino: 'categorias' | 'equipe') {
    if (!obraId) {
      avisar('Escolha uma obra primeiro')
      return navigate('/obras')
    }
    navigate(`/obra/${obraId}/${destino}`)
  }

  return (
    <>
      <Tela titulo="Perfil">
        {/* Tocável: o nome é o que os sócios veem em cada lançamento e no relatório. */}
        <button
          className="cd"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: '14px 16px' }}
          onClick={() => setNovoNome(perfil?.nome ?? '')}
        >
          {/* Quem entrou pelo Google já tem foto; os outros ficam com as iniciais. */}
          {perfil?.avatar_url ? (
            <img className="av" src={perfil.avatar_url} alt="" referrerPolicy="no-referrer" style={{ width: 46, height: 46 }} />
          ) : (
            <div className="av" style={{ width: 46, height: 46, fontSize: 15 }}>{perfil?.iniciais ?? '·'}</div>
          )}
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
            <b style={{ fontSize: 17 }}>{perfil?.nome ?? 'você'}</b>
            <span className="note" style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {souDono ? 'dono de obra' : 'lança os próprios gastos'} · {session?.user.email}
            </span>
          </span>
          <span style={{ fontSize: 13, color: 'var(--azul-700)', flex: 'none' }}>editar</span>
        </button>

        <h2 style={GRUPO}>Avisos</h2>
        <div className="lista">
          <button className="linha" style={{ padding: '13px 0' }} onClick={() => navigate('/notificacoes', { state: { de: '/perfil' } })}>
            <span className="linha-txt">
              <b style={TITULO_LINHA}>Notificações</b>
              <span className="note">o que a equipe lança e muda nas obras</span>
            </span>
            <Lado>{naoLidas ? `${naoLidas} ${naoLidas === 1 ? 'nova' : 'novas'}` : null}</Lado>
          </button>
          {push && push !== 'sem-suporte' && (
            <button
              className="linha"
              style={{ padding: '13px 0' }}
              onClick={alternarPush}
              disabled={mexendoPush}
              aria-busy={mexendoPush || undefined}
              {...(pushInterruptor ? { role: 'switch', 'aria-checked': push === 'ligado' } : {})}
            >
              <span className="linha-txt">
                <b style={TITULO_LINHA}>{nomeDoAviso()}</b>
                <span className="note">{textoDoPush(push).nota}</span>
              </span>
              {pushInterruptor ? (
                <Interruptor ligado={push === 'ligado'} ocupado={mexendoPush} />
              ) : (
                <Lado>{mexendoPush ? '…' : textoDoPush(push).rotulo}</Lado>
              )}
            </button>
          )}
        </div>

        <h2 style={GRUPO}>Obras</h2>
        <div className="lista">
          <button className="linha" style={{ padding: '13px 0' }} onClick={() => navigate('/plano')}>
            <b style={TITULO_LINHA}>Plano e cobrança</b>
            <Lado>{estadoDoPlano}</Lado>
          </button>
          <button className="linha" style={{ padding: '13px 0' }} onClick={() => abrir('categorias')}>
            <b style={TITULO_LINHA}>Categorias de gasto</b>
            <Lado />
          </button>
          <button className="linha" style={{ padding: '13px 0' }} onClick={() => abrir('equipe')}>
            <b style={TITULO_LINHA}>Equipe da obra</b>
            <Lado />
          </button>
        </div>

        <h2 style={GRUPO}>Compartilhar</h2>
        <div className="lista">
          {/* Religado: mail.appalicerce.com.br verificado no Resend em 15/09/2026. Antes
              disso o serviço só entregava na caixa do dono da conta, e o botão produziria
              erro para qualquer outra pessoa. Quem define o remetente é o secret
              RESEND_FROM — sem ele, a função cai no endereço compartilhado e a limitação
              antiga volta. */}
          <button className="linha" style={{ padding: '13px 0' }} onClick={() => setDestino(session?.user.email ?? '')} disabled={enviando}>
            <span className="linha-txt">
              <b style={TITULO_LINHA}>Relatório por e-mail</b>
              <span className="note">resumo das obras, na hora</span>
            </span>
            <Lado seta={!enviando}>{enviando ? 'enviando…' : null}</Lado>
          </button>
          {/* Desligado de verdade (disabled), como o resto da lista é de botões: o leitor de
              tela anuncia "indisponível" em vez de ler uma linha solta. */}
          <button className="linha" disabled style={{ padding: '13px 0', cursor: 'default', opacity: .6 }}>
            <b style={TITULO_LINHA}>Resumo no WhatsApp</b>
            <Lado seta={false}>Em breve</Lado>
          </button>
        </div>

        {socios.length > 0 && (
          <div className="lista" style={{ borderColor: 'var(--alerta-borda)', boxShadow: 'none', marginTop: 8 }}>
            <button className="linha" style={{ padding: '13px 0' }} onClick={() => setConfirmando(true)}>
              <span className="linha-txt">
                <b style={{ ...TITULO_LINHA, color: 'var(--alerta)' }}>Desfazer sociedade</b>
                <span className="note">
                  {socios.length === 1
                    ? `você e ${socios[0].nome.split(' ')[0]} veem as obras um do outro`
                    : `você e mais ${socios.length} pessoas veem as mesmas obras`}
                </span>
              </span>
              <Seta cor="var(--alerta-borda)" />
            </button>
          </div>
        )}

        <div className="ann">
          O histórico de cada obra é compartilhado com quem está nela: todo lançamento mostra quem enviou, e só quem lançou pode
          apagar.
        </div>

        <button className="bt" style={{ width: '100%', marginTop: 'auto' }} onClick={() => sair()}>Sair</button>
      </Tela>

      {/* As três folhas numa presença só, cada uma com sua chave: assim a saída anima
          também, e não só a entrada. */}
      <AnimatePresence>
      {novoNome !== null && (
        <Sheet key="nome" aoFechar={() => setNovoNome(null)}>
          <div className="sheet-titulo"><b>Seu nome</b></div>
          <span className="note">É como os sócios veem você nos lançamentos, nas entradas e no relatório.</span>
          <input
            className="inp"
            autoCapitalize="words"
            placeholder="Nome e sobrenome"
            value={novoNome}
            onChange={e => setNovoNome(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && salvarNome()}
            autoFocus
          />
          <button className="bt btp" style={{ width: '100%' }} onClick={salvarNome} disabled={renomeando || !novoNome.trim()}>
            {renomeando ? 'salvando…' : 'Salvar nome'}
          </button>
        </Sheet>
      )}

      {confirmando && (
        <Sheet key="sociedade" aoFechar={() => setConfirmando(false)}>
          <div className="sheet-titulo"><b>Desfazer a sociedade?</b></div>
          <span className="note">
            Você volta a ver só as obras que são suas
            {socios.length === 1 ? `, e ${socios[0].nome.split(' ')[0]} deixa de vê-las` : ', e os sócios deixam de vê-las'}.
            O caminho de volta é um convite novo.
          </span>
          {/* O que NÃO se perde importa tanto quanto o que se perde: sem isto a pessoa
              hesita achando que vai apagar o histórico da obra. */}
          <div className="ann">
            Nenhum lançamento é apagado. O que cada um gastou continua no histórico da obra,
            com o nome de quem enviou.
          </div>
          <button className="bt btp" style={{ width: '100%' }} onClick={desfazer} disabled={saindo}>
            {saindo ? 'desfazendo…' : 'Sim, desfazer'}
          </button>
          <button className="bt" style={{ width: '100%' }} onClick={() => setConfirmando(false)} disabled={saindo}>
            Continuar sócios
          </button>
        </Sheet>
      )}

      {destino !== null && (
        <Sheet key="email" aoFechar={() => setDestino(null)}>
          <div className="sheet-titulo"><b>Mandar o resumo por e-mail</b></div>
          <span className="note">
            Vai o resumo de todas as obras que você vê: recebido, gasto e quanto falta em cada uma.
          </span>
          <input
            className="inp"
            type="email"
            inputMode="email"
            autoCapitalize="none"
            placeholder="Para quem?"
            value={destino}
            onChange={e => setDestino(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && mandarEmail(destino)}
          />
          <button
            className="bt btp"
            style={{ width: '100%' }}
            onClick={() => mandarEmail(destino)}
            disabled={enviando || !destino.trim()}
          >
            {enviando ? 'enviando…' : 'Enviar agora'}
          </button>
          <div className="ann">
            Enquanto não houver um domínio próprio verificado, o serviço de e-mail só entrega na
            caixa de quem é dono da conta dele.
          </div>
        </Sheet>
      )}
      </AnimatePresence>
    </>
  )
}

// O interruptor do aviso no celular. Só desenho: quem tem o papel de "switch" e o estado
// (aria-checked) é o botão da linha inteira, que é o alvo de toque.
function Interruptor({ ligado, ocupado }: { ligado: boolean; ocupado: boolean }) {
  return (
    <span
      aria-hidden="true"
      style={{
        position: 'relative',
        width: 42,
        height: 26,
        borderRadius: 99,
        flex: 'none',
        background: ligado ? 'var(--navy)' : 'var(--linha-forte)',
        opacity: ocupado ? 0.55 : 1,
        transition: 'background .15s, opacity .15s',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: 2,
          width: 22,
          height: 22,
          borderRadius: '50%',
          background: '#fff',
          boxShadow: '0 1px 3px rgba(10, 42, 110, .25)',
          // Anda por transform, não por left: a placa de vídeo move sem recalcular o layout.
          transform: ligado ? 'translateX(16px)' : 'none',
          transition: 'transform .15s',
        }}
      />
    </span>
  )
}
