// Manda o resumo das obras por e-mail, para quem pediu, com os dados que essa pessoa
// pode ver.
//
// A consulta roda com o token de quem chamou, não com a service_role: assim a RLS
// continua valendo e ninguém recebe por e-mail número de obra que não veria no app.
import { createClient } from 'npm:@supabase/supabase-js@2'

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

const NAVY = '#0A2A6E'
const CINZA = '#5B7392'
const LINHA = '#E1EAF6'

function real(valor: number): string {
  return 'R$ ' + Math.round(valor || 0).toLocaleString('pt-BR')
}

function escapar(texto: string): string {
  return texto.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}

type LinhaObra = { nome: string; recebido: number; aberto: number; saidas: number; pct: number }

// E-mail é HTML de 1999: tabela para layout e estilo na própria tag. Gmail e Outlook
// descartam <style> no topo, então classe nenhuma sobrevive à viagem.
function montarHtml(nome: string, obras: LinhaObra[], totais: { aberto: number; recebido: number; gasto: number }) {
  const linhas = obras
    .map(
      o => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid ${LINHA};">
          <div style="font-size:15px;color:${NAVY};font-weight:600;">${escapar(o.nome)}</div>
          <div style="font-size:13px;color:${CINZA};padding-top:2px;">${o.pct}% recebido · gasto ${real(o.saidas)}</div>
        </td>
        <td align="right" style="padding:10px 0;border-bottom:1px solid ${LINHA};white-space:nowrap;">
          <div style="font-size:15px;color:${NAVY};font-weight:600;">${real(o.aberto)}</div>
          <div style="font-size:12px;color:${CINZA};padding-top:2px;">a receber</div>
        </td>
      </tr>`,
    )
    .join('')

  return `<!doctype html>
<html lang="pt-BR"><body style="margin:0;padding:0;background:#F5F8FC;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F8FC;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid ${LINHA};border-radius:14px;padding:28px 24px;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">

        <tr><td align="center" style="padding-bottom:6px;">
          <div style="width:30px;height:6px;background:#1B8FE8;border-radius:1px;margin:0 auto 3px;"></div>
          <div style="width:42px;height:6px;background:#6CB4F0;border-radius:1px;margin:0 auto 3px;"></div>
          <div style="width:38px;height:6px;background:#1B8FE8;border-radius:1px;margin:0 auto 3px;"></div>
          <div style="width:45px;height:6px;background:${NAVY};border-radius:1px;margin:0 auto;"></div>
        </td></tr>

        <tr><td align="center" style="padding:16px 0 4px;font-size:21px;font-weight:700;color:${NAVY};">
          Suas obras hoje
        </td></tr>
        <tr><td align="center" style="font-size:13px;color:${CINZA};padding-bottom:22px;">
          ${escapar(nome)} · ${new Date().toLocaleDateString('pt-BR')}
        </td></tr>

        <tr><td style="background:#F5F8FC;border:1px solid ${LINHA};border-radius:10px;padding:18px 20px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="font-size:14px;color:${CINZA};padding-bottom:8px;">Já recebido</td>
              <td align="right" style="font-size:14px;color:${NAVY};font-weight:600;padding-bottom:8px;">${real(totais.recebido)}</td>
            </tr>
            <tr>
              <td style="font-size:14px;color:${CINZA};padding-bottom:10px;">Já gasto</td>
              <td align="right" style="font-size:14px;color:${NAVY};font-weight:600;padding-bottom:10px;">${real(totais.gasto)}</td>
            </tr>
            <tr><td colspan="2" style="border-top:1px solid ${LINHA};padding-top:10px;"></td></tr>
            <tr>
              <td style="font-size:16px;color:${NAVY};font-weight:700;">A receber</td>
              <td align="right" style="font-size:19px;color:${NAVY};font-weight:700;">${real(totais.aberto)}</td>
            </tr>
          </table>
        </td></tr>

        <tr><td style="padding:26px 0 6px;font-size:15px;font-weight:700;color:${NAVY};">Obra a obra</td></tr>
        <tr><td>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${linhas}</table>
        </td></tr>

        <tr><td style="padding-top:26px;font-size:12px;color:${CINZA};text-align:center;">
          Alicerce · obras e gastos no lugar certo<br>
          Você recebeu isto porque pediu o resumo dentro do app.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const autorizacao = req.headers.get('Authorization')
  if (!autorizacao) return responde({ erro: 'sem credencial' }, 401)

  const chaveResend = Deno.env.get('RESEND_API_KEY')
  if (!chaveResend) return responde({ erro: 'RESEND_API_KEY não configurada' }, 500)

  const url = Deno.env.get('SUPABASE_URL')!
  const comoUsuario = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: autorizacao } },
  })

  const { data: auth } = await comoUsuario.auth.getUser()
  if (!auth?.user) return responde({ erro: 'sessão inválida' }, 401)

  const { para } = await req.json().catch(() => ({ para: null }))
  const destino: string = para || auth.user.email
  if (!destino) return responde({ erro: 'informe o e-mail de destino' }, 400)

  try {
    // Com o token do usuário: a RLS decide o que entra no e-mail.
    const { data: perfil } = await comoUsuario
      .from('profiles')
      .select('nome')
      .eq('id', auth.user.id)
      .maybeSingle()

    const { data: obras, error } = await comoUsuario
      .from('obras')
      .select('id, nome, valor_fechado, lancamentos(tipo, valor), aditivos(valor)')
      .order('created_at', { ascending: false })
    if (error) throw error

    const linhas: LinhaObra[] = (obras ?? []).map(o => {
      const lanc = (o.lancamentos ?? []) as { tipo: string; valor: number }[]
      const adit = (o.aditivos ?? []) as { valor: number }[]
      const recebido = lanc.filter(l => l.tipo === 'entrada').reduce((s, l) => s + Number(l.valor), 0)
      const saidas = lanc.filter(l => l.tipo === 'saida').reduce((s, l) => s + Number(l.valor), 0)
      const total = Number(o.valor_fechado) + adit.reduce((s, a) => s + Number(a.valor), 0)
      return {
        nome: o.nome as string,
        recebido,
        saidas,
        aberto: Math.max(total - recebido, 0),
        pct: total ? Math.min(Math.round((recebido / total) * 100), 100) : 0,
      }
    })

    if (!linhas.length) return responde({ erro: 'você ainda não tem obras para resumir' }, 400)

    const totais = {
      aberto: linhas.reduce((s, o) => s + o.aberto, 0),
      recebido: linhas.reduce((s, o) => s + o.recebido, 0),
      gasto: linhas.reduce((s, o) => s + o.saidas, 0),
    }

    // Sem domínio próprio verificado, o Resend só entrega no e-mail dono da conta e
    // exige este remetente. Com domínio, define-se RESEND_FROM e passa a valer para
    // qualquer destinatário.
    const remetente = Deno.env.get('RESEND_FROM') ?? 'Alicerce <onboarding@resend.dev>'

    const resposta = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${chaveResend}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: remetente,
        to: [destino],
        subject: `Alicerce · suas obras em ${new Date().toLocaleDateString('pt-BR')}`,
        html: montarHtml(perfil?.nome ?? 'você', linhas, totais),
      }),
    })

    const corpo = await resposta.json().catch(() => ({}))
    if (!resposta.ok) {
      // A mensagem do Resend é específica (domínio não verificado, destinatário não
      // permitido, chave inválida) e é ela que diz o que consertar — repassar ajuda mais
      // do que um "falhou" genérico.
      return responde({ erro: corpo?.message ?? `o serviço de e-mail respondeu ${resposta.status}` }, 200)
    }

    return responde({ status: 'enviado', para: destino, id: corpo?.id ?? null })
  } catch (e) {
    return responde({ erro: e instanceof Error ? e.message : 'não deu para enviar o e-mail' }, 200)
  }
})
