import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { enviarRelatorioPorEmail, listarObras, listarSocios, sairDaSociedade } from '../data/api'
import { useAsync } from '../lib/hooks'
import { useAuth, useUsuario } from '../lib/auth'
import { useObraAtual } from '../lib/obraAtual'
import { useAviso } from '../components/Toast'
import { Tela } from '../components/Tela'
import { TabBar } from '../components/TabBar'
import { Sheet } from '../components/Sheet'
import { useNotificacoes } from '../lib/notificacoes'
import { ehNativo } from '../lib/plataforma'
import type { EstadoPush } from '../lib/push'

// O aviso com o app fechado, em cada situação em que o celular pode estar (lib/push.ts).
const PUSH: Record<Exclude<EstadoPush, 'sem-suporte'>, { nota: string; rotulo: string }> = {
  ligado: { nota: 'chega mesmo com o app fechado, com o toque do Alicerce', rotulo: 'ligado' },
  desligado: { nota: 'toque para saber na hora o que o sócio lança', rotulo: 'desligado ›' },
  bloqueado: { nota: 'bloqueado no Android: Configurações › Apps › Alicerce › Notificações', rotulo: '›' },
  'atualizar-app': { nota: 'instale a versão nova do app para receber com ele fechado', rotulo: 'atualizar' },
}

export function Perfil() {
  const navigate = useNavigate()
  const { session, sair } = useAuth()
  const { userId, perfil } = useUsuario()
  const { obraId } = useObraAtual()
  const avisar = useAviso()
  const { naoLidas } = useNotificacoes()
  const [push, setPush] = useState<EstadoPush | null>(null)
  const [mexendoPush, setMexendoPush] = useState(false)

  // Só no APK. Confere de novo na volta ao app: a pessoa pode ter liberado a permissão nas
  // configurações do Android e voltado.
  useEffect(() => {
    if (!ehNativo()) return
    let ativo = true
    const conferir = () =>
      import('../lib/push')
        .then(m => m.estadoDoPush())
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

  async function alternarPush() {
    if (push === 'bloqueado') return avisar('Libere em Configurações › Apps › Alicerce › Notificações')
    if (push === 'atualizar-app') return avisar('Peça o app novo: o aviso com ele fechado só vem na versão nova')
    setMexendoPush(true)
    try {
      const m = await import('../lib/push')
      const novo = push === 'ligado' ? await m.desligarPush() : await m.ligarPush()
      setPush(novo)
      avisar(
        novo === 'ligado' ? 'Aviso no celular ligado' : novo === 'bloqueado' ? 'Permissão negada no Android' : 'Aviso no celular desligado',
      )
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'não deu para mudar o aviso')
    } finally {
      setMexendoPush(false)
    }
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

  function abrir(destino: 'categorias' | 'equipe') {
    if (!obraId) {
      avisar('Escolha uma obra primeiro')
      return navigate('/obras')
    }
    navigate(`/obra/${obraId}/${destino}`)
  }

  return (
    <>
      <Tela titulo="Perfil" comAbas>
        <div className="cd" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {/* Quem entrou pelo Google já tem foto; os outros ficam com as iniciais. */}
          {perfil?.avatar_url ? (
            <img className="av" src={perfil.avatar_url} alt="" referrerPolicy="no-referrer" />
          ) : (
            <div className="av">{perfil?.iniciais ?? '·'}</div>
          )}
          <div style={{ flex: 1 }}>
            <b style={{ fontSize: 15 }}>{perfil?.nome ?? 'você'}</b>
            <div className="note">{souDono ? 'dono de obra' : 'lança os próprios gastos'} · {session?.user.email}</div>
          </div>
        </div>

        <button className="li" onClick={() => navigate('/notificacoes', { state: { de: '/perfil' } })}>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <b style={{ fontSize: 14 }}>Notificações</b>
            <div className="note">o que a equipe lança e muda nas obras</div>
          </div>
          <span className="note">{naoLidas ? `${naoLidas} ${naoLidas === 1 ? 'nova' : 'novas'} ›` : '›'}</span>
        </button>
        {push && push !== 'sem-suporte' && (
          <button
            className="li"
            onClick={alternarPush}
            disabled={mexendoPush}
            {...(push === 'ligado' || push === 'desligado' ? { role: 'switch', 'aria-checked': push === 'ligado' } : {})}
          >
            <div style={{ flex: 1, textAlign: 'left' }}>
              <b style={{ fontSize: 14 }}>Aviso no celular</b>
              <div className="note">{PUSH[push].nota}</div>
            </div>
            <span className="note">{mexendoPush ? '…' : PUSH[push].rotulo}</span>
          </button>
        )}
        <button className="li" onClick={() => navigate('/plano')}>
          <b style={{ fontSize: 14 }}>Plano e cobrança</b>
          <span className="note">›</span>
        </button>
        <button className="li" onClick={() => abrir('categorias')}>
          <b style={{ fontSize: 14 }}>Categorias de gasto</b>
          <span className="note">›</span>
        </button>
        <button className="li" onClick={() => abrir('equipe')}>
          <b style={{ fontSize: 14 }}>Equipe da obra</b>
          <span className="note">›</span>
        </button>
        {/* Religado: mail.appalicerce.com.br verificado no Resend em 15/09/2026. Antes
            disso o serviço só entregava na caixa do dono da conta, e o botão produziria
            erro para qualquer outra pessoa. Quem define o remetente é o secret
            RESEND_FROM — sem ele, a função cai no endereço compartilhado e a limitação
            antiga volta. */}
        <button className="li" onClick={() => setDestino(session?.user.email ?? '')} disabled={enviando}>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <b style={{ fontSize: 14 }}>Relatório por e-mail</b>
            <div className="note">resumo das obras, na hora</div>
          </div>
          <span className="note">{enviando ? 'enviando…' : '›'}</span>
        </button>
        {/* Desligado de verdade (disabled), como o resto da lista é de botões: o leitor de
            tela anuncia "indisponível" em vez de ler uma linha solta. */}
        <button className="li" disabled style={{ cursor: 'default', opacity: .6 }}>
          <b style={{ fontSize: 14 }}>Resumo no WhatsApp</b>
          <span className="note">Em breve</span>
        </button>

        {socios.length > 0 && (
          <button
            className="li"
            onClick={() => setConfirmando(true)}
            style={{ borderColor: '#FBD5B5' }}
          >
            <div style={{ flex: 1, textAlign: 'left' }}>
              <b style={{ fontSize: 14, color: '#9A3412' }}>Desfazer sociedade</b>
              <div className="note">
                {socios.length === 1
                  ? `você e ${socios[0].nome.split(' ')[0]} veem as obras um do outro`
                  : `você e mais ${socios.length} pessoas veem as mesmas obras`}
              </div>
            </div>
            <span className="note">›</span>
          </button>
        )}

        <div className="ann">
          O histórico de cada obra é compartilhado com quem está nela: todo lançamento mostra quem enviou, e só quem lançou pode
          apagar.
        </div>

        <div style={{ marginTop: 'auto' }}>
          <button className="bt" style={{ width: '100%' }} onClick={() => sair()}>Sair</button>
        </div>
      </Tela>
      <TabBar ativa="perfil" />

      {confirmando && (
        <Sheet aoFechar={() => setConfirmando(false)}>
          <b style={{ fontSize: 17 }}>Desfazer a sociedade?</b>
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
        <Sheet aoFechar={() => setDestino(null)}>
          <b style={{ fontSize: 17 }}>Mandar o resumo por e-mail</b>
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
    </>
  )
}
