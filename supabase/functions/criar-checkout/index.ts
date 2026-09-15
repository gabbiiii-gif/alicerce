// Abre o pagamento: devolve a URL do checkout do Stripe (ou a do portal de
// gerenciamento, para quem já assina).
//
// Quem decide de quem é a assinatura é o SERVIDOR, a partir da sessão de quem chamou —
// nunca o corpo do pedido. Se o grupo viesse do app, bastaria trocar o valor para pagar
// a assinatura de outra pessoa, ou pior, atribuir a si o pagamento alheio.
import Stripe from 'npm:stripe@22.6.2'
import { createClient } from 'npm:@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  httpClient: Stripe.createFetchHttpClient(),
})
const PRECO = Deno.env.get('STRIPE_PRICE_ID')!

// Para onde o Stripe devolve a pessoa. Fixo no servidor, não vindo do app: endereço de
// retorno que o cliente escolhe é porta aberta para mandar gente pagando para outro lugar.
const SITE = Deno.env.get('ALICERCE_SITE') ?? 'https://alicerceobras.vercel.app'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function responde(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const autorizacao = req.headers.get('Authorization')
  if (!autorizacao) return responde({ erro: 'sem credencial' }, 401)

  const url = Deno.env.get('SUPABASE_URL')!
  const servico = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const comoUsuario = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: autorizacao } },
  })

  const { data: auth } = await comoUsuario.auth.getUser()
  if (!auth?.user) return responde({ erro: 'sessão inválida' }, 401)

  const { data: perfil } = await servico
    .from('profiles')
    .select('grupo_id')
    .eq('id', auth.user.id)
    .maybeSingle()
  if (!perfil?.grupo_id) return responde({ erro: 'perfil sem grupo' }, 400)

  const grupoId = perfil.grupo_id as string
  const { acao } = await req.json().catch(() => ({ acao: 'assinar' }))

  const { data: assinatura } = await servico
    .from('assinaturas')
    .select('stripe_customer_id, stripe_subscription_id, status, vale_ate, titular_id')
    .eq('grupo_id', grupoId)
    .maybeSingle()

  try {
    // Portal: trocar cartão, ver faturas, cancelar. Sem cliente no Stripe não há o que
    // gerenciar — quem nunca pagou cai no checkout.
    if (acao === 'gerenciar') {
      if (!assinatura?.stripe_customer_id) return responde({ erro: 'você ainda não tem assinatura' }, 400)
      // A tela já esconde o botão do convidado, mas esconder não é impedir: quem chamar
      // a função direto passaria do mesmo jeito e cancelaria o plano de quem paga.
      if (assinatura.titular_id && assinatura.titular_id !== auth.user.id) {
        return responde({ erro: 'só quem assinou pode gerenciar o plano' }, 403)
      }
      const portal = await stripe.billingPortal.sessions.create({
        customer: assinatura.stripe_customer_id,
        return_url: `${SITE}/plano`,
      })
      return responde({ url: portal.url })
    }

    // Já paga: não abrir outro checkout. Sem esta trava, dois cliques em dias diferentes
    // viram duas assinaturas ativas para o mesmo grupo — e duas cobranças por mês.
    const valeAte = assinatura?.vale_ate ? new Date(assinatura.vale_ate).getTime() : 0
    if (assinatura && ['trialing', 'active'].includes(assinatura.status) && valeAte > Date.now()) {
      return responde({ erro: 'seu grupo já tem plano ativo', ja_tem: true }, 400)
    }

    // Um Customer por grupo, reaproveitado. Criar outro a cada tentativa espalharia o
    // histórico de pagamento em vários clientes e quebraria o portal.
    let cliente = assinatura?.stripe_customer_id ?? null
    if (!cliente) {
      const novo = await stripe.customers.create({
        email: auth.user.email ?? undefined,
        metadata: { grupo_id: grupoId, titular_id: auth.user.id },
      })
      cliente = novo.id
    }

    // Sete dias de teste, UMA vez por grupo. Sem esta checagem, cancelar e assinar de
    // novo renderia mais sete dias a cada volta — de graça, para sempre.
    const primeiraVez = !assinatura?.stripe_subscription_id

    const sessao = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: cliente,
      line_items: [{ price: PRECO, quantity: 1 }],
      locale: 'pt-BR',
      // Os dois caminhos pelos quais o webhook descobre de quem é o pagamento:
      // client_reference_id chega no checkout.session.completed, e o metadata fica
      // colado na assinatura para todos os eventos seguintes.
      client_reference_id: grupoId,
      subscription_data: {
        // titular_id é quem passou o cartão. É o que impede o convidado, que lê a
        // mesma linha de assinatura, de abrir o portal e cancelar o plano alheio.
        metadata: { grupo_id: grupoId, titular_id: auth.user.id },
        ...(primeiraVez ? { trial_period_days: 7 } : {}),
      },
      success_url: `${SITE}/plano?pago=1`,
      cancel_url: `${SITE}/plano`,
    })

    return responde({ url: sessao.url })
  } catch (e) {
    console.error('falha no checkout', e)
    return responde({ erro: e instanceof Error ? e.message : 'não deu para abrir o pagamento' }, 500)
  }
})
