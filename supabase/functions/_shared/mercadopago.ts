// O que as duas funções de Pix dividem: o preço, a chamada ao Mercado Pago e a conferência
// que credita o plano.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

// O preço mora no servidor. Vindo do app, bastaria mandar 0,01 para pagar um mês.
export const PRECO = 150

const API = 'https://api.mercadopago.com/v1/payments'

function token() {
  const t = Deno.env.get('MP_ACCESS_TOKEN')
  if (!t) throw new Error('MP_ACCESS_TOKEN não configurado')
  return t
}

// O Mercado Pago quer a data com fuso explícito; o "Z" do toISOString nem sempre passa.
function paraBrasilia(ms: number) {
  return new Date(ms - 3 * 3600_000).toISOString().replace('Z', '-03:00')
}

export type PixCriado = {
  mp_payment_id: string
  status: string
  qr_code: string
  qr_code_base64: string
  expira_em: string
}

export async function criarPix(p: { referencia: string; email: string; expiraEm: number }): Promise<PixCriado> {
  const url = Deno.env.get('SUPABASE_URL')!
  const r = await fetch(API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token()}`,
      'Content-Type': 'application/json',
      // A linha de pagamentos serve de chave: repetir a chamada devolve o mesmo Pix em vez
      // de criar um segundo.
      'X-Idempotency-Key': p.referencia,
    },
    body: JSON.stringify({
      transaction_amount: PRECO,
      description: 'Alicerce — plano mensal',
      payment_method_id: 'pix',
      payer: { email: p.email },
      external_reference: p.referencia,
      date_of_expiration: paraBrasilia(p.expiraEm),
      // Sem configurar nada no painel: cada Pix já diz para onde avisar.
      notification_url: `${url}/functions/v1/mercadopago-webhook`,
    }),
  })
  const mp = await r.json().catch(() => null)
  if (!r.ok || !mp?.id) {
    console.error('Mercado Pago recusou o Pix', r.status, mp)
    throw new Error(mp?.message ?? `Mercado Pago respondeu ${r.status}`)
  }
  const dados = mp.point_of_interaction?.transaction_data ?? {}
  return {
    mp_payment_id: String(mp.id),
    status: mp.status,
    qr_code: dados.qr_code,
    qr_code_base64: dados.qr_code_base64,
    expira_em: new Date(p.expiraEm).toISOString(),
  }
}

// Pergunta ao Mercado Pago como está o pagamento e, se aprovado, credita o mês.
//
// É o ÚNICO caminho que libera acesso, e ele nunca acredita no aviso que chegou: busca o
// pagamento pelo id com o nosso token. Um aviso falso, no máximo, faz a gente conferir um
// pagamento de verdade.
export async function conferir(servico: SupabaseClient, mpPaymentId: string) {
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
