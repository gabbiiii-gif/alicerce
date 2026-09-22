// Aviso do Mercado Pago de que um pagamento mudou.
//
// O aviso em si não vale nada: ele só diz "olhe o pagamento X". Quem decide é conferir(),
// que busca o pagamento na API deles com o nosso token. Por isso não há validação de
// assinatura aqui — um aviso forjado só faria a gente conferir um pagamento real.
//
// Arquivo único de propósito, para poder colar no editor do painel do Supabase. A
// conferência é a mesma da função pix — mudou aqui, muda lá.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

const API = 'https://api.mercadopago.com/v1/payments'

function token() {
  const t = Deno.env.get('MP_ACCESS_TOKEN')
  if (!t) throw new Error('MP_ACCESS_TOKEN não configurado')
  return t
}

// Pergunta ao Mercado Pago como está o pagamento e, se aprovado, credita o mês.
//
// É o ÚNICO caminho que libera acesso, e ele nunca acredita no aviso que chegou: busca o
// pagamento pelo id com o nosso token. Um aviso falso, no máximo, faz a gente conferir um
// pagamento de verdade.
async function conferir(servico: SupabaseClient, mpPaymentId: string) {
  const r = await fetch(`${API}/${mpPaymentId}`, { headers: { Authorization: `Bearer ${token()}` } })
  if (!r.ok) throw new Error(`Mercado Pago respondeu ${r.status} ao conferir ${mpPaymentId}`)
  const mp = await r.json()

  if (mp.status === 'approved') {
    const { data, error } = await servico.rpc('creditar_pix', {
      p_mp_payment_id: String(mp.id),
      p_valor: mp.transaction_amount,
    })
    if (error) throw error
    // null aqui é "já tinha sido creditado" — o outro caminho chegou antes. Continua aprovado.
    return { status: 'approved', vale_ate: (data as string | null) ?? null }
  }

  await servico
    .from('pagamentos')
    .update({ status: mp.status })
    .eq('mp_payment_id', String(mp.id))
    .is('pago_em', null)
  return { status: mp.status as string, vale_ate: null }
}

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
