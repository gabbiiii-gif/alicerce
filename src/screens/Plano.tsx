import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { abrirPagamento, carregarPlano, planoVale } from '../data/api'
import { useAsync } from '../lib/hooks'
import { useUsuario } from '../lib/auth'
import { useAviso } from '../components/Toast'
import { isoParaBR } from '../lib/format'
import { Carregando, Tela } from '../components/Tela'

export function Plano() {
  const [params, setParams] = useSearchParams()
  const voltandoDoPagamento = params.get('pago') === '1'
  const { userId } = useUsuario()
  const { dados, carregando, erro, recarregar } = useAsync(carregarPlano, [])
  const [abrindo, setAbrindo] = useState(false)
  const avisar = useAviso()

  const assinatura = dados?.assinatura ?? null
  const titular = dados?.titular ?? null

  const vale = planoVale(assinatura)
  const status = assinatura?.status ?? 'sem_assinatura'
  const ate = assinatura?.vale_ate ? isoParaBR(assinatura.vale_ate.slice(0, 10)) : null

  // Cortesia é acesso sem cartão, de quem já usava o app antes de existir plano. Vale
  // como plano, mas não há nada para gerenciar no Stripe: o que essa pessoa precisa ver
  // é o convite para assinar, antes de a cortesia acabar.
  const ehCortesia = status === 'cortesia'
  // Convidado: usa o plano de quem pagou, e nunca mexe nele.
  const souConvidado = !!(vale && assinatura?.titular_id && assinatura.titular_id !== userId)
  const podeGerenciar = vale && !ehCortesia && !souConvidado

  // Voltando do Stripe, o pagamento já passou — mas o webhook é outro caminho e pode
  // demorar alguns segundos. Sem esta espera, quem acabou de pagar veria "sem plano"
  // justamente no instante em que mais precisa de confirmação.
  useEffect(() => {
    if (!voltandoDoPagamento) return
    if (vale) {
      setParams({}, { replace: true })
      return
    }
    let tentativas = 0
    const id = setInterval(() => {
      if (++tentativas > 8) return clearInterval(id)
      recarregar()
    }, 2000)
    return () => clearInterval(id)
  }, [voltandoDoPagamento, vale, recarregar, setParams])

  async function pagar(acao: 'assinar' | 'gerenciar') {
    setAbrindo(true)
    try {
      await abrirPagamento(acao)
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'não deu para abrir o pagamento')
    } finally {
      setAbrindo(false)
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

      {voltandoDoPagamento && !vale && (
        <div className="ann">Pagamento recebido — confirmando com o Stripe, isso leva alguns segundos.</div>
      )}

      {/* Convidado não vê preço nem botão: ele não tem o que pagar nem o que decidir. */}
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
          <div className="note">Quem cuida da assinatura, do cartão e do cancelamento é quem assinou.</div>
        </div>
      ) : (
        <div className="cd">
          <div className="row">
            <b style={{ fontSize: 17 }}>Alicerce</b>
            <b className="num" style={{ fontSize: 17 }}>R$ 150<span className="note">/mês</span></b>
          </div>
          <div className="note">Obras, lançamentos e leitura de notas pelo agente, sem limite.</div>
          <div className="note">Você e mais uma pessoa da sua equipe, no mesmo plano.</div>
          <div className="note">7 dias de teste grátis.</div>
        </div>
      )}

      {!carregando && !souConvidado && (
        <div
          className="cd"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            borderColor: status === 'past_due' ? '#FBD5B5' : undefined,
          }}
        >
          <span
            className={vale ? 'chip bta' : 'chip'}
            style={vale && !ehCortesia ? { background: '#1B8FE8', borderColor: '#1B8FE8' } : undefined}
          >
            {!vale
              ? 'sem plano'
              : ehCortesia
                ? 'cortesia'
                : status === 'trialing'
                  ? 'em teste'
                  : status === 'past_due'
                    ? 'atrasado'
                    : 'ativo'}
          </span>
          <div className="note" style={{ flex: 1 }}>
            {!vale && status === 'canceled' && 'Sua assinatura foi cancelada.'}
            {!vale && status !== 'canceled' && 'Seu grupo ainda não tem assinatura.'}
            {vale && ehCortesia && `Seu acesso vai até ${ate}. Assine antes disso para não parar.`}
            {vale && status === 'past_due' && `O último pagamento falhou. Atualize o cartão até ${ate}.`}
            {vale && status === 'trialing' && `Teste grátis até ${ate}. Depois, R$ 150 por mês.`}
            {vale && status === 'active' && `Renova em ${ate}.`}
          </div>
        </div>
      )}

      {!carregando && !souConvidado && (
        <button className="bt btp" onClick={() => pagar(podeGerenciar ? 'gerenciar' : 'assinar')} disabled={abrindo}>
          {abrindo ? 'abrindo…' : podeGerenciar ? 'Gerenciar assinatura' : 'Assinar por R$ 150/mês'}
        </button>
      )}

      {podeGerenciar && (
        <div className="ann">
          No gerenciamento você troca o cartão, vê as faturas e cancela quando quiser. Cancelando, o acesso continua até {ate}.
        </div>
      )}

      {!souConvidado && (
        <div className="ann">
          O plano é do grupo: quem entrar pelo seu convite usa o app sem pagar de novo, e não mexe na sua assinatura.
        </div>
      )}
    </Tela>
  )
}
