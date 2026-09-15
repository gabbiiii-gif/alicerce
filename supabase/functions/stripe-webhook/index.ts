// Webhook do Stripe — a ÚNICA coisa que escreve na tabela assinaturas.
//
// O app não tem caminho para essa tabela: a migration 0010 tirou os grants de anon e
// authenticated e não criou policy de escrita. Quem grava é esta função, com a service
// role, depois de conferir que o pedido veio mesmo do Stripe.
//
// Regra de resposta, que é o que decide se uma cobrança some ou não:
//   400 — assinatura do webhook inválida. Não é o Stripe; não adianta repetir.
//   500 — o Stripe é quem mandou, mas nós falhamos ao gravar. O Stripe repete com
//         espera crescente, e a cobrança não se perde.
//   200 — tratado, ou evento que não nos interessa. O Stripe para de repetir.
// Devolver 200 numa falha de banco perderia o evento para sempre — e com ele a
// assinatura de alguém que já pagou.
import Stripe from 'npm:stripe@22.6.2'
import { createClient } from 'npm:@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  // No Deno o cliente HTTP padrão do SDK é o do Node e não vale aqui.
  httpClient: Stripe.createFetchHttpClient(),
})

// Conferir a assinatura do webhook precisa de crypto assíncrono no Deno: a versão
// síncrona (constructEvent) usa crypto de Node e quebra em runtime, não na publicação.
const cripto = Stripe.createSubtleCryptoProvider()
const SEGREDO = Deno.env.get('STRIPE_WEBHOOK_SECRET')!

const banco = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

// Folga sobre o fim do período pago. Entre a renovação ser cobrada e este webhook
// chegar passam segundos — mas se passar mais, ninguém pode ficar travado por isso.
const FOLGA_DIAS = 2

function valeAte(assinatura: Stripe.Subscription): string | null {
  // current_period_end saiu do objeto da assinatura e passou para os itens nas versões
  // recentes da API. Lendo os dois lugares, a conta continua certa em qualquer uma —
  // e errar aqui é travar quem pagou, ou liberar quem não pagou.
  const fim =
    (assinatura as unknown as { current_period_end?: number }).current_period_end ??
    assinatura.items?.data?.[0]?.current_period_end
  if (!fim) return null
  return new Date((fim + FOLGA_DIAS * 86400) * 1000).toISOString()
}

function idDoCliente(assinatura: Stripe.Subscription): string | null {
  const c = assinatura.customer
  return typeof c === 'string' ? c : c?.id ?? null
}

// De quem é esta assinatura. Tenta o metadata primeiro (posto pela função de checkout) e
// cai para a linha que já existe — é o caso do Link de pagamento, onde o grupo chegou
// pelo client_reference_id no checkout.session.completed.
async function grupoDe(assinatura: Stripe.Subscription): Promise<string | null> {
  const doMetadata = assinatura.metadata?.grupo_id
  if (doMetadata) return doMetadata

  const cliente = idDoCliente(assinatura)
  const filtro = [`stripe_subscription_id.eq.${assinatura.id}`]
  if (cliente) filtro.push(`stripe_customer_id.eq.${cliente}`)

  const { data } = await banco
    .from('assinaturas')
    .select('grupo_id')
    .or(filtro.join(','))
    .limit(1)
    .maybeSingle()

  return data?.grupo_id ?? null
}

async function gravar(grupoId: string, assinatura: Stripe.Subscription) {
  const titular = assinatura.metadata?.titular_id

  const { error } = await banco.from('assinaturas').upsert(
    {
      grupo_id: grupoId,
      stripe_customer_id: idDoCliente(assinatura),
      stripe_subscription_id: assinatura.id,
      status: assinatura.status,
      vale_ate: valeAte(assinatura),
      // Só escreve quando o evento traz: a coluna que não entra no upsert mantém o valor
      // que já estava. Mandar undefined apagaria o titular no primeiro evento sem
      // metadata, e o convidado passaria a ver o botão de cancelar.
      ...(titular ? { titular_id: titular } : {}),
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: 'grupo_id' },
  )
  if (error) throw error
}

Deno.serve(async req => {
  const cabecalho = req.headers.get('stripe-signature')
  if (!cabecalho) return new Response('sem assinatura', { status: 400 })

  // O corpo CRU, como chegou. Um req.json() antes daqui muda os bytes e a conferência
  // da assinatura passa a falhar sempre, sem explicação óbvia.
  const corpo = await req.text()

  let evento: Stripe.Event
  try {
    evento = await stripe.webhooks.constructEventAsync(corpo, cabecalho, SEGREDO, undefined, cripto)
  } catch (e) {
    console.error('assinatura do webhook não confere', e instanceof Error ? e.message : e)
    return new Response('assinatura inválida', { status: 400 })
  }

  try {
    switch (evento.type) {
      // A porta de entrada: é o único evento que sabe qual grupo pagou.
      case 'checkout.session.completed': {
        const sessao = evento.data.object as Stripe.Checkout.Session
        if (sessao.mode !== 'subscription') break

        const grupoId = sessao.client_reference_id
        const idAssinatura = typeof sessao.subscription === 'string' ? sessao.subscription : sessao.subscription?.id

        if (!grupoId || !idAssinatura) {
          // Pagou e não dá para saber de quem é. Acontece se alguém abrir o Link de
          // pagamento sem o ?client_reference_id=. Fica registrado para ligar na mão.
          console.error('checkout sem grupo ou sem assinatura', sessao.id, grupoId, idAssinatura)
          break
        }

        // Busca o estado atual na API em vez de confiar no que veio no evento: os
        // eventos não chegam em ordem garantida, e a API é a fonte da verdade.
        const assinatura = await stripe.subscriptions.retrieve(idAssinatura)
        await gravar(grupoId, assinatura)
        break
      }

      // Renovou, o cartão falhou, a pessoa cancelou, o teste virou pago: tudo passa por
      // aqui. invoice.payment_failed não precisa ser tratado à parte — ele muda o status
      // da assinatura para past_due, e isso chega como subscription.updated.
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const assinatura = evento.data.object as Stripe.Subscription
        const grupoId = await grupoDe(assinatura)
        if (!grupoId) {
          // Pode ser só ordem de chegada: o checkout.session.completed ainda não criou a
          // linha. Ele vai criar, e com o estado buscado da API — nada se perde.
          console.error('assinatura sem grupo conhecido (ainda)', assinatura.id)
          break
        }
        await gravar(grupoId, assinatura)
        break
      }
    }
  } catch (e) {
    console.error('falha ao gravar', e)
    return new Response('erro ao gravar', { status: 500 })
  }

  return new Response('ok', { status: 200 })
})
