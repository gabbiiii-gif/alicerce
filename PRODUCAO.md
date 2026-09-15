# Virada para produção

Como sair do sandbox e começar a receber de verdade, e como ligar o domínio
`appalicerce.com.br`. O [SETUP.md](SETUP.md) monta o Alicerce do zero; este arquivo é só a
virada.

Faça na ordem. Cada parte tem uma verificação no fim — se ela não passar, pare ali em vez
de seguir, porque o erro só piora escondido atrás do próximo passo.

---

## Antes de começar

Confira que continua valendo:

- O banco **não tem histórico de migrations**. Migration vai **colada no SQL Editor**,
  nunca por `supabase db push` — ele tentaria aplicar as doze do zero por cima do que já
  existe.
- O projeto Supabase (`ryygkiehthqjaivtafkg`) fica na organização **Gabdev2**, que é de
  outra conta. O acesso vem de convite.
- **O papel de Desenvolvedor na Gabdev2 basta** para tudo o que está aqui: `secrets set`,
  `secrets list` e `functions deploy` funcionam (verificado em 15/09/2026). A descrição do
  papel no painel diz "não é possível alterar configurações", mas isso não cobre secrets de
  Edge Function. Não precisa subir para Owner — e não convém, porque ser Owner na Gabdev2
  conta no seu limite de projetos grátis e trava o downgrade da `gabb dev`.
- **Rode os comandos de dentro de `alicerce/`.** Os caminhos das funções são relativos à
  pasta: da raiz do repositório, o deploy falha com "Entrypoint path does not exist".

---

## Parte 1 — Domínio `appalicerce.com.br`

### 1.1 Adicionar na Vercel

Projeto → **Settings → Domains → Add** → `appalicerce.com.br`.

A Vercel mostra os registros de DNS. No painel de onde você registrou o domínio, crie o
que ela pedir (normalmente um `A` para o apex e um `CNAME` para o `www`). A propagação
costuma levar minutos, mas pode levar horas.

> ⚠️ **Não remova o domínio `alicerceobras.vercel.app`.**
>
> O `capacitor.config.ts` grava o endereço do site **dentro do APK**, na hora de gerar.
> Todo aparelho que já tem o Alicerce instalado carrega a tela de
> `alicerceobras.vercel.app`. Se esse endereço parar de responder, esses aparelhos abrem
> uma tela em branco — e não há como corrigir remotamente, porque é justamente o caminho
> pelo qual as correções chegam.
>
> Os dois domínios servindo o mesmo projeto resolvem: aparelho antigo continua carregando
> pelo endereço antigo, e ainda assim recebe o código novo a cada deploy.

### 1.2 `VITE_SITE_URL` na Vercel

Projeto → **Settings → Environment Variables**:

```
VITE_SITE_URL = https://appalicerce.com.br
```

É o endereço que o app usa para montar **links de convite**. Sem trocar, os convites
continuam saindo com o endereço antigo — funcionam, mas ninguém entende que o produto tem
domínio próprio.

Variável de ambiente só entra no bundle na hora do build: **force um redeploy** depois de
salvar, senão nada muda.

### 1.3 Supabase — endereços de retorno do login

Painel do Supabase → **Authentication → URL Configuration**:

- **Site URL**: `https://appalicerce.com.br`
- **Redirect URLs**: mantenha o endereço antigo e **acrescente** os novos:
  ```
  https://appalicerce.com.br/**
  https://www.appalicerce.com.br/**
  https://alicerceobras.vercel.app/**
  app.alicerce://login
  ```

Os quatro precisam estar lá. Os dois primeiros são o domínio novo com e sem `www` — mesmo
com um redirecionando para o outro, vale ter os dois enquanto a transição não terminar. O
terceiro mantém funcionando quem abre pelo endereço antigo, inclusive os APKs já
instalados. O quarto é o esquema pelo qual o Android reabre o app depois do login Google.

Endereço fora dessa lista não dá erro claro: o Supabase simplesmente devolve a pessoa no
Site URL, e o login parece ter dado certo no lugar errado.

### 1.4 Google Cloud — origens autorizadas

Console do Google → **APIs e serviços → Credenciais** → o Client ID OAuth do Alicerce.

Em **Origens JavaScript autorizadas**, acrescente as duas:

```
https://appalicerce.com.br
https://www.appalicerce.com.br
```

Sem o `www`, quem digitar o endereço com ele leva recusa do Google — a origem que o
navegador manda é a da página onde está, não a do destino do redirecionamento.

Na **Tela de permissão OAuth**, o campo *Domínios autorizados* exige que o Google confirme
que o domínio é seu, pelo **Google Search Console** (registro TXT no DNS). É um passo à
parte, com espera de propagação — comece cedo.

O **URI de redirecionamento** continua sendo o do Supabase
(`https://ryygkiehthqjaivtafkg.supabase.co/auth/v1/callback`) — esse não muda com o
domínio.

Aproveite e confira que a tela de consentimento está **Em produção**, não "Testando". Em
teste, o Google recusa o login de quem não estiver na lista de testadores — e a recusa
chega sem mensagem que ajude.

### 1.5 Endereço de retorno do pagamento

O checkout devolve a pessoa para `/plano` no endereço que a função conhece: o secret
`ALICERCE_SITE`, ou o padrão escrito no código, que já é o domínio novo. **Feito em
15/09/2026** — fica aqui para o dia em que o endereço mudar de novo.

```powershell
supabase secrets set ALICERCE_SITE=https://appalicerce.com.br --project-ref ryygkiehthqjaivtafkg
supabase functions deploy criar-checkout --project-ref ryygkiehthqjaivtafkg
```

**O deploy não é opcional.** Secret gravado só vale para a função depois de republicada —
sem isso, a função continua rodando com o valor antigo e nada indica o problema.

### 1.6 APK novo (quando for gerar)

```powershell
$env:ALICERCE_SITE_URL = "https://appalicerce.com.br"
npm run android:apk
```

Só vale para APKs gerados dali em diante. Os que já estão instalados seguem no endereço
antigo, e por isso ele precisa continuar no ar (1.1).

### ✅ Verificação da Parte 1

1. `https://appalicerce.com.br` abre o app
2. `https://alicerceobras.vercel.app` **também** abre
3. Login com Google pelo domínio novo entra e volta para dentro do app
4. Um convite gerado em *Quem está na obra* sai com `appalicerce.com.br` no link
5. Em **Perfil → Plano**, clicar em Assinar abre o Stripe e o botão de voltar retorna para
   `appalicerce.com.br/plano`

---

## Parte 2 — Stripe de verdade

Até aqui tudo roda na **área restrita** (sandbox). Cartão real é recusado.

> Teste e produção são mundos separados no Stripe. Produto, preço, chaves e webhook **não
> passam de um para o outro**. Tudo abaixo é criar de novo, no modo live.

### 2.1 Ativar a conta

Painel do Stripe → **Ativar conta** (ou "Obtenha sua conta de produção").

Pedem CPF ou CNPJ, endereço, descrição do negócio, site e conta bancária brasileira. Com
CNPJ costuma ser mais rápido.

Na análise, o Stripe abre o seu site e espera encontrar: **o que é vendido, por quanto,
termos de uso, política de privacidade e um contato**. Site sem isso é a causa número um
de ativação travada — resolva antes de mandar, não depois.

> O Stripe **não emite nota fiscal brasileira**. Cobrando R$ 150/mês de gente no Brasil, a
> NF é problema seu, resolvido fora do Stripe.

### 2.2 Produto e preço no modo live

Com a conta já em produção, troque para a conta de produção no seletor do topo e crie de
novo:

- **Catálogo de produtos → Adicionar produto**
- Nome `Alicerce`, descrição `Acesso ao app para você e mais uma pessoa da sua equipe`
- Imagem: o mesmo PNG navy do logo
- **R$ 150,00 · Recorrente · Mensal · BRL**

Copie o **ID do preço** (`price_...`). É **outro**, diferente do de teste.

### 2.3 Webhook no modo live

**Desenvolvedores → Webhooks → Adicionar endpoint**:

```
https://ryygkiehthqjaivtafkg.supabase.co/functions/v1/stripe-webhook
```

Eventos:

```
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
```

A URL é a mesma do sandbox — a função é uma só. O que muda é o **segredo**: este endpoint
gera um `whsec_` novo, e é ele que passa a valer.

### 2.4 Trocar os três secrets

Chave secreta em **Desenvolvedores → Chaves de API**, agora no modo live: começa com
`sk_live_`.

```powershell
supabase secrets set `
  STRIPE_SECRET_KEY=sk_live_... `
  STRIPE_WEBHOOK_SECRET=whsec_... `
  STRIPE_PRICE_ID=price_... `
  --project-ref ryygkiehthqjaivtafkg

supabase functions deploy stripe-webhook --project-ref ryygkiehthqjaivtafkg
supabase functions deploy criar-checkout --project-ref ryygkiehthqjaivtafkg
```

Os dois deploys são obrigatórios, pelo mesmo motivo de sempre: secret só vale depois de
republicar.

Não cole a `sk_live_` em conversa, arquivo ou commit. Do painel para o terminal, direto.

### 2.5 Limpar a assinatura de teste

A sua linha em `assinaturas` aponta para uma assinatura do sandbox, que o Stripe de
produção nunca vai mencionar. Ela ficaria `active` até a data vencer e depois congelaria
sem nunca receber evento.

No SQL Editor, achando o seu grupo:

```sql
select a.grupo_id, a.status, a.vale_ate, p.nome
from public.assinaturas a
join public.profiles p on p.grupo_id = a.grupo_id
order by a.atualizado_em desc;

-- confira qual é a sua antes de rodar
delete from public.assinaturas where grupo_id = 'SEU_GRUPO_AQUI';
```

Depois assine de novo pelo app, com cartão de verdade. É o teste real do fluxo em
produção — e a primeira receita.

### ✅ Verificação da Parte 2

1. **Perfil → Plano** → Assinar abre um checkout **sem** o aviso de modo de teste
2. Pagar com cartão de verdade cobra R$ 0,00 hoje (os 7 dias de teste) e guarda o cartão
3. A tela volta e o chip vira **em teste**, com a data do fim do período
4. No Stripe, **Desenvolvedores → Eventos**, o `checkout.session.completed` mostra
   resposta **200** do nosso endpoint
5. No SQL Editor, a linha em `assinaturas` tem `status` e `titular_id` preenchidos

Se o passo 3 travar em "confirmando", o webhook falhou. Olhe o evento no Stripe: ele
mostra o que foi enviado e o que a função respondeu.

---

## Parte 3 — Depois da virada

### A cortesia de quem já usa

Todo grupo que existia quando a `0012` rodou ganhou acesso de cortesia com prazo. Confira
quanto falta:

```sql
select count(*) as grupos, min(vale_ate) as primeiro_a_vencer
from public.assinaturas where status = 'cortesia';
```

Quando essa data chegar, essas pessoas param de conseguir lançar. **Avise antes.** Se
precisar de mais tempo:

```sql
update public.assinaturas
set vale_ate = now() + interval '15 days', atualizado_em = now()
where status = 'cortesia';
```

E para liberar alguém na mão, sem cobrar:

```sql
insert into public.assinaturas (grupo_id, status, vale_ate)
values ('GRUPO', 'cortesia', now() + interval '365 days')
on conflict (grupo_id) do update
set status = 'cortesia', vale_ate = excluded.vale_ate, atualizado_em = now();
```

### Papel na Gabdev2

Continue como **Desenvolvedor**. É o bastante para secret e para deploy, e evita que os
projetos da Gabdev2 contem no seu limite de projetos grátis — o que travaria de novo o
downgrade da `gabb dev`.

---

## Mapa rápido

| O que | Onde vive |
|---|---|
| Endereço público do app (convites) | `VITE_SITE_URL` na Vercel |
| Endereço de retorno do pagamento | secret `ALICERCE_SITE` no Supabase |
| Endereço gravado no APK | `ALICERCE_SITE_URL` na hora de gerar |
| Chave e preço do Stripe | secrets no Supabase |
| Segredo do webhook | secret no Supabase, vindo do endpoint no Stripe |
| Quem tem plano | tabela `assinaturas`, só o webhook escreve |
| Quem barra sem plano | `plano_ativo()` nas policies de insert (`0012`) |

## O que nunca fazer

- `supabase db push` neste projeto
- Tirar `alicerceobras.vercel.app` do ar
- Gravar secret sem republicar a função depois
- Colar `sk_live_` em qualquer lugar que não seja o terminal
