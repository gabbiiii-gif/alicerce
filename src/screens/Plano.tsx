import { useEffect, useState, type CSSProperties } from 'react'
import { conferirPix, gerarPix, type Pix } from '../data/api'
import { usePlano } from '../lib/plano'
import { useUsuario } from '../lib/auth'
import { useAviso } from '../components/Toast'
import { dataBR } from '../lib/format'
import { Carregando, Tela } from '../components/Tela'

// De quanto em quanto tempo a tela pergunta se o Pix caiu. O webhook costuma chegar antes,
// mas é outro caminho — se ele falhar, é isto que libera o plano de quem pagou.
const CONFERIR_A_CADA_MS = 5000

// O texto de apoio dentro do cartão navy: o azul-claro de rótulo do herói, um pouco maior
// porque aqui são frases inteiras, não rótulos.
const TEXTO_HEROI: CSSProperties = { fontSize: 13.5, lineHeight: 1.45, color: '#9FC4F0' }

export function Plano() {
  const { userId } = useUsuario()
  // Mesma fonte que a faixa de aviso das outras telas: pagar aqui tem que apagar o aviso lá.
  const { plano: dados, carregando, erro, vale, ehCortesia, recarregar } = usePlano()
  const avisar = useAviso()
  const [pix, setPix] = useState<Pix | null>(null)
  const [gerando, setGerando] = useState(false)
  const [conferindo, setConferindo] = useState(false)

  const assinatura = dados?.assinatura ?? null
  const titular = dados?.titular ?? null
  const ate = assinatura?.vale_ate ? dataBR(assinatura.vale_ate) : null

  // Convidado: usa o plano de quem pagou, e nunca paga.
  const souConvidado = !!(vale && assinatura?.titular_id && assinatura.titular_id !== userId)

  async function conferir(manual: boolean) {
    if (manual) setConferindo(true)
    try {
      const r = await conferirPix()
      if (r.status === 'approved') {
        setPix(null)
        await recarregar()
        avisar(r.vale_ate ? `Pagamento confirmado. Plano até ${dataBR(r.vale_ate)}.` : 'Pagamento confirmado.')
      } else if (manual) {
        avisar('Ainda não caiu. Pode levar alguns segundos depois de pagar.')
      }
    } catch (e) {
      if (manual) avisar(e instanceof Error ? e.message : 'não deu para conferir')
    } finally {
      if (manual) setConferindo(false)
    }
  }

  useEffect(() => {
    if (!pix) return
    const expira = new Date(pix.expira_em).getTime()
    const id = setInterval(() => {
      if (Date.now() > expira) {
        clearInterval(id)
        setPix(null)
        avisar('O Pix expirou. Gere outro para pagar.')
        return
      }
      conferir(false)
    }, CONFERIR_A_CADA_MS)
    return () => clearInterval(id)
    // conferir muda a cada render; o que importa aqui é só o Pix aberto.
  }, [pix])

  async function pagar() {
    setGerando(true)
    try {
      setPix(await gerarPix())
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'não deu para gerar o Pix')
    } finally {
      setGerando(false)
    }
  }

  async function copiar() {
    if (!pix) return
    try {
      await navigator.clipboard.writeText(pix.qr_code)
      avisar('Código Pix copiado')
    } catch {
      avisar('copie o código da tela')
    }
  }

  const primeiroNome = (titular?.nome ?? '').split(' ')[0]

  // A data em mono e navy, como os outros números do app: é o dado que a pessoa procura
  // na frase.
  const data = (texto: string | null) => (
    <span className="num" style={{ color: 'var(--navy)' }}>{texto}</span>
  )

  return (
    <Tela titulo="Plano" voltar="/perfil">
      {carregando && !dados && <Carregando />}

      {erro && !carregando && (
        <>
          <div className="ann ann-alerta">Não deu para ler seu plano: {erro}</div>
          <button className="bt" onClick={() => recarregar()}>Tentar de novo</button>
        </>
      )}

      {/* Convidado não vê preço nem Pix: ele não tem o que pagar nem o que decidir. */}
      {souConvidado ? (
        <div className="heroi" style={{ padding: 18, gap: 8 }}>
          <div className="row" style={{ alignItems: 'baseline' }}>
            <b style={{ fontSize: 20, letterSpacing: '-.015em' }}>Você é convidado</b>
            <span className="chip bta">liberado</span>
          </div>
          <span style={TEXTO_HEROI}>
            {primeiroNome
              ? `Você está no plano de ${titular?.nome}. Não há nada a pagar.`
              : 'Você está no plano de quem te convidou. Não há nada a pagar.'}
          </span>
          <span style={TEXTO_HEROI}>Quem cuida do pagamento é quem assinou.</span>
        </div>
      ) : (
        <div className="heroi" style={{ padding: 18, gap: 8 }}>
          <div className="row" style={{ alignItems: 'baseline' }}>
            <b style={{ fontSize: 20, letterSpacing: '-.015em' }}>Alicerce</b>
            {/* Num <b>, a regra `.scr b` ganharia de `.num`: a fonte de dados vai explícita. */}
            <b className="num" style={{ fontFamily: 'var(--fonte-dados)', fontSize: 22, letterSpacing: '-.02em' }}>
              R$ 150
              <span style={{ fontFamily: 'var(--fonte-texto)', fontSize: 13, letterSpacing: 0, color: '#9FC4F0' }}>/mês</span>
            </b>
          </div>
          <span style={TEXTO_HEROI}>Obras, lançamentos e leitura de notas pelo agente, sem limite.</span>
          <span style={TEXTO_HEROI}>Você e mais uma pessoa da sua equipe, no mesmo plano.</span>
          <span style={TEXTO_HEROI}>Pagamento por Pix, pelo Mercado Pago.</span>
        </div>
      )}

      {!carregando && !souConvidado && (
        <div className="cd" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: '14px 16px' }}>
          <span className={vale ? 'chip bta' : 'chip'} style={{ padding: '6px 12px' }}>
            {!vale ? 'sem plano' : ehCortesia ? 'cortesia' : 'pago'}
          </span>
          <span className="note" style={{ flex: 1, fontSize: 13.5, lineHeight: 1.4 }}>
            {!vale && (ate ? <>Seu plano venceu em {data(ate)}.</> : 'Seu grupo ainda não tem plano.')}
            {vale && ehCortesia && <>Seu acesso vai até {data(ate)}.</>}
            {vale && !ehCortesia && <>Pago até {data(ate)}. Próximo pagamento nesse dia.</>}
          </span>
        </div>
      )}

      {!carregando && !souConvidado && pix && (
        <div className="cd" style={{ alignItems: 'center', gap: 10, padding: '16px' }}>
          <b style={{ fontSize: 16, textAlign: 'center' }}>Pague R$ {pix.valor} com o app do seu banco</b>
          <img
            src={`data:image/png;base64,${pix.qr_code_base64}`}
            alt="QR Code do Pix"
            style={{ width: 220, height: 220, maxWidth: '100%' }}
          />
          <div className="note" style={{ textAlign: 'center', fontSize: 13 }}>
            No celular, use o Pix copia e cola. Vale até{' '}
            {new Date(pix.expira_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.
          </div>
          <button className="bt btp" style={{ width: '100%' }} onClick={copiar}>Copiar código Pix</button>
          <button className="bt" style={{ width: '100%' }} onClick={() => conferir(true)} disabled={conferindo}>
            {conferindo ? 'conferindo…' : 'Já paguei'}
          </button>
          <div className="note" style={{ textAlign: 'center', fontSize: 13 }}>
            A confirmação aparece aqui sozinha em alguns segundos depois do pagamento.
          </div>
        </div>
      )}

      {!carregando && !souConvidado && !pix && (
        <button className="bt btp" onClick={pagar} disabled={gerando}>
          {gerando ? 'gerando Pix…' : vale && !ehCortesia ? 'Pagar o próximo mês com Pix' : 'Pagar R$ 150 com Pix'}
        </button>
      )}

      {!souConvidado && (
        <div className="ann">
          {vale && !ehCortesia && `Pagando antes do vencimento, o mês novo começa em ${ate} — você não perde dias. `}
          O plano é do grupo: quem entrar pelo seu convite usa o app sem pagar de novo.
        </div>
      )}
    </Tela>
  )
}
