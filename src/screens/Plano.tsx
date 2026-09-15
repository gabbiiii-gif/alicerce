import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { abrirPagamento, carregarAssinatura, planoVale } from '../data/api'
import { useAsync } from '../lib/hooks'
import { useAviso } from '../components/Toast'
import { isoParaBR } from '../lib/format'
import { Carregando, Tela } from '../components/Tela'

export function Plano() {
  const [params, setParams] = useSearchParams()
  const voltandoDoPagamento = params.get('pago') === '1'
  const { dados: assinatura, carregando, erro, recarregar } = useAsync(carregarAssinatura, [])
  const [abrindo, setAbrindo] = useState(false)
  const avisar = useAviso()

  const vale = planoVale(assinatura)
  const status = assinatura?.status ?? 'sem_assinatura'
  const ate = assinatura?.vale_ate ? isoParaBR(assinatura.vale_ate.slice(0, 10)) : null

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

  return (
    <Tela titulo="Plano" voltar="/perfil">
      {carregando && !assinatura && <Carregando />}

      {erro && !carregando && (
        <>
          <div className="ann">Não deu para ler seu plano: {erro}</div>
          <button className="bt" onClick={() => recarregar()}>Tentar de novo</button>
        </>
      )}

      {voltandoDoPagamento && !vale && (
        <div className="ann">Pagamento recebido — confirmando com o Stripe, isso leva alguns segundos.</div>
      )}

      <div className="cd">
        <div className="row">
          <b style={{ fontSize: 17 }}>Alicerce</b>
          <b className="num" style={{ fontSize: 17 }}>R$ 150<span className="note">/mês</span></b>
        </div>
        <div className="note">Obras, lançamentos e leitura de notas pelo agente, sem limite.</div>
        <div className="note">Você e mais uma pessoa da sua equipe, no mesmo plano.</div>
      </div>

      {!carregando && (
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
            style={vale ? { background: '#1B8FE8', borderColor: '#1B8FE8' } : undefined}
          >
            {vale ? (status === 'trialing' ? 'em teste' : status === 'past_due' ? 'atrasado' : 'ativo') : 'sem plano'}
          </span>
          <div className="note" style={{ flex: 1 }}>
            {!vale && status === 'canceled' && 'Sua assinatura foi cancelada.'}
            {!vale && status !== 'canceled' && 'Seu grupo ainda não tem assinatura.'}
            {vale && status === 'past_due' && `O último pagamento falhou. Atualize o cartão até ${ate}.`}
            {vale && status === 'trialing' && `Teste grátis até ${ate}.`}
            {vale && status === 'active' && `Renova em ${ate}.`}
          </div>
        </div>
      )}

      {!carregando && (
        <button className="bt btp" onClick={() => pagar(vale ? 'gerenciar' : 'assinar')} disabled={abrindo}>
          {abrindo ? 'abrindo…' : vale ? 'Gerenciar assinatura' : 'Assinar por R$ 150/mês'}
        </button>
      )}

      {vale && (
        <div className="ann">
          No gerenciamento você troca o cartão, vê as faturas e cancela quando quiser. Cancelando, o acesso continua até {ate}.
        </div>
      )}

      <div className="ann">
        O plano é do grupo: quem entrar pelo seu convite usa o app sem pagar de novo.
      </div>
    </Tela>
  )
}
