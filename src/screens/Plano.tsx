import { useEffect, useState } from 'react'
import { conferirPix, gerarPix, type Pix } from '../data/api'
import { usePlano } from '../lib/plano'
import { useUsuario } from '../lib/auth'
import { useAviso } from '../components/Toast'
import { dataBR } from '../lib/format'
import { Carregando, Tela } from '../components/Tela'

// De quanto em quanto tempo a tela pergunta se o Pix caiu. O webhook costuma chegar antes,
// mas é outro caminho — se ele falhar, é isto que libera o plano de quem pagou.
const CONFERIR_A_CADA_MS = 5000

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

  return (
    <Tela titulo="Plano" voltar="/perfil">
      {carregando && !dados && <Carregando />}

      {erro && !carregando && (
        <>
          <div className="ann">Não deu para ler seu plano: {erro}</div>
          <button className="bt" onClick={() => recarregar()}>Tentar de novo</button>
        </>
      )}

      {/* Convidado não vê preço nem Pix: ele não tem o que pagar nem o que decidir. */}
      {souConvidado ? (
        <div className="cd">
          <div className="row">
            <b style={{ fontSize: 17 }}>Você é convidado</b>
            <span className="chip bta" style={{ background: '#2272CC', borderColor: '#2272CC' }}>liberado</span>
          </div>
          <div className="note">
            {primeiroNome
              ? `Você está no plano de ${titular?.nome}. Não há nada a pagar.`
              : 'Você está no plano de quem te convidou. Não há nada a pagar.'}
          </div>
          <div className="note">Quem cuida do pagamento é quem assinou.</div>
        </div>
      ) : (
        <div className="cd">
          <div className="row">
            <b style={{ fontSize: 17 }}>Alicerce</b>
            <b className="num" style={{ fontSize: 17 }}>R$ 150<span className="note">/mês</span></b>
          </div>
          <div className="note">Obras, lançamentos e leitura de notas pelo agente, sem limite.</div>
          <div className="note">Você e mais uma pessoa da sua equipe, no mesmo plano.</div>
          <div className="note">Pagamento por Pix, pelo Mercado Pago.</div>
        </div>
      )}

      {!carregando && !souConvidado && (
        <div className="cd" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <span
            className={vale ? 'chip bta' : 'chip'}
            style={vale && !ehCortesia ? { background: '#2272CC', borderColor: '#2272CC' } : undefined}
          >
            {!vale ? 'sem plano' : ehCortesia ? 'cortesia' : 'pago'}
          </span>
          <div className="note" style={{ flex: 1 }}>
            {!vale && (ate ? `Seu plano venceu em ${ate}.` : 'Seu grupo ainda não tem plano.')}
            {vale && ehCortesia && `Seu acesso vai até ${ate}.`}
            {vale && !ehCortesia && `Pago até ${ate}. Próximo pagamento nesse dia.`}
          </div>
        </div>
      )}

      {!carregando && !souConvidado && pix && (
        <div className="cd" style={{ alignItems: 'center', gap: 10 }}>
          <b style={{ fontSize: 15 }}>Pague R$ {pix.valor} com o app do seu banco</b>
          <img
            src={`data:image/png;base64,${pix.qr_code_base64}`}
            alt="QR Code do Pix"
            style={{ width: 220, height: 220, maxWidth: '100%' }}
          />
          <div className="note" style={{ textAlign: 'center' }}>
            No celular, use o Pix copia e cola. Vale até{' '}
            {new Date(pix.expira_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.
          </div>
          <button className="bt btp" style={{ width: '100%' }} onClick={copiar}>Copiar código Pix</button>
          <button className="bt" style={{ width: '100%' }} onClick={() => conferir(true)} disabled={conferindo}>
            {conferindo ? 'conferindo…' : 'Já paguei'}
          </button>
          <div className="note" style={{ textAlign: 'center' }}>
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
