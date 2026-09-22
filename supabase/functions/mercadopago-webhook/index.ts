// Aviso do Mercado Pago de que um pagamento mudou.
//
// O aviso em si não vale nada: ele só diz "olhe o pagamento X". Quem decide é conferir(),
// que busca o pagamento na API deles com o nosso token. Por isso não há validação de
// assinatura aqui — um aviso forjado só faria a gente conferir um pagamento real.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { conferir } from '../_shared/mercadopago.ts'

Deno.serve(async req => {
  const url = new URL(req.url)
  const corpo = await req.json().catch(() => null)

  // Dois formatos convivem: o webhook novo (type + data.id) e o IPN antigo (topic + id).
  const tipo = corpo?.type ?? url.searchParams.get('type') ?? url.searchParams.get('topic')
  const id = String(corpo?.data?.id ?? url.searchParams.get('data.id') ?? url.searchParams.get('id') ?? '')
  if (tipo !== 'payment' || !id) return new Response('ok')

  const servico = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // Só pagamentos que nós criamos. Id desconhecido nem chega a virar chamada ao Mercado Pago.
  const { data: nosso } = await servico.from('pagamentos').select('id').eq('mp_payment_id', id).maybeSingle()
  if (!nosso) return new Response('ok')

  try {
    await conferir(servico, id)
  } catch (e) {
    // Status de erro faz o Mercado Pago tentar de novo mais tarde. Engolir aqui seria um
    // Pix pago que nunca libera o plano.
    console.error('falha ao conferir pagamento', id, e)
    return new Response('erro', { status: 500 })
  }
  return new Response('ok')
})
