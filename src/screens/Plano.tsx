import { usePlano } from '../lib/plano'
import { useUsuario } from '../lib/auth'
import { useAviso } from '../components/Toast'
import { isoParaBR } from '../lib/format'
import { Carregando, Tela } from '../components/Tela'

// Pagamento por Pix, confirmado na mão (0013). A chave vem do build para não precisar de
// versão nova do app quando ela mudar — só de um deploy na Vercel.
const CHAVE_PIX = import.meta.env.VITE_PIX_CHAVE ?? ''

export function Plano() {
  const { userId } = useUsuario()
  // Mesma fonte que a faixa de aviso das outras telas: duas cargas separadas discordariam
  // até a próxima navegação.
  const { plano: dados, carregando, erro, vale, ehCortesia, recarregar } = usePlano()
  const avisar = useAviso()

  const assinatura = dados?.assinatura ?? null
  const titular = dados?.titular ?? null
  const ate = assinatura?.vale_ate ? isoParaBR(assinatura.vale_ate.slice(0, 10)) : null

  // Convidado: usa o plano de quem pagou, e nunca paga.
  const souConvidado = !!(vale && assinatura?.titular_id && assinatura.titular_id !== userId)

  async function copiarChave() {
    try {
      await navigator.clipboard.writeText(CHAVE_PIX)
      avisar('Chave Pix copiada')
    } catch {
      avisar('copie a chave da tela')
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

      {/* Convidado não vê preço nem chave: ele não tem o que pagar nem o que decidir. */}
      {souConvidado ? (
        <div className="cd">
          <div className="row">
            <b style={{ fontSize: 17 }}>Você é convidado</b>
            <span className="chip bta" style={{ background: '#1B8FE8', borderColor: '#1B8FE8' }}>liberado</span>
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
          <div className="note">Pagamento por Pix.</div>
        </div>
      )}

      {!carregando && !souConvidado && (
        <div className="cd" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <span
            className={vale ? 'chip bta' : 'chip'}
            style={vale && !ehCortesia ? { background: '#1B8FE8', borderColor: '#1B8FE8' } : undefined}
          >
            {!vale ? 'sem plano' : ehCortesia ? 'cortesia' : 'pago'}
          </span>
          <div className="note" style={{ flex: 1 }}>
            {!vale && (ate ? `Seu plano venceu em ${ate}.` : 'Seu grupo ainda não tem plano.')}
            {vale && ehCortesia && `Seu acesso vai até ${ate}.`}
            {vale && !ehCortesia && `Pago até ${ate}.`}
          </div>
        </div>
      )}

      {!carregando && !souConvidado && CHAVE_PIX && (
        <div className="cd">
          <b style={{ fontSize: 15 }}>{vale ? 'Para renovar' : 'Para liberar'}</b>
          <div className="note">Faça um Pix de R$ 150 para a chave abaixo e mande o comprovante para a gente.</div>
          <div className="row" style={{ gap: 8 }}>
            <b className="num" style={{ flex: 1, wordBreak: 'break-all' }}>{CHAVE_PIX}</b>
            <button className="bt" style={{ fontSize: 13.5, padding: 6 }} onClick={copiarChave}>Copiar</button>
          </div>
        </div>
      )}

      {!souConvidado && (
        <div className="ann">
          O acesso é liberado assim que o Pix é confirmado. O plano é do grupo: quem entrar pelo seu
          convite usa o app sem pagar de novo.
        </div>
      )}
    </Tela>
  )
}
