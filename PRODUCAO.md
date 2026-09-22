# Virada para produção

Como ligar o domínio `appalicerce.com.br` e como receber e liberar pagamentos por Pix. O [SETUP.md](SETUP.md) monta o Alicerce do zero; este arquivo é só a
virada.

Faça na ordem. Cada parte tem uma verificação no fim — se ela não passar, pare ali em vez
de seguir, porque o erro só piora escondido atrás do próximo passo.

---

## Antes de começar

Confira que continua valendo:

- O banco **não tem histórico de migrations**. Migration vai **colada no SQL Editor**,
  nunca por `supabase db push` — ele tentaria aplicar todas do zero por cima do que já
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

### 1.5 APK novo (quando for gerar)

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

---

## Parte 2 — Pagamento por Pix

Não há checkout nem webhook. A pessoa paga o Pix, você confere o extrato e libera o grupo
no SQL Editor. Quem barra sem plano continua sendo `plano_ativo()` (`0013`).

### 2.1 Aplicar a `0013`

Cole `supabase/migrations/0013_pagamento_pix.sql` no SQL Editor. Antes, decida a linha
**ESCOLHA AQUI**: até quando vale o que os grupos existentes já pagaram (padrão: 30 dias a
partir de hoje; quem já tinha prazo maior fica com o maior).

Ela passa **todo** grupo existente para `pix`. Os status do Stripe (`active`, `trialing`,
`past_due`) deixam de valer.

### 2.2 Chave Pix na Vercel

`VITE_PIX_CHAVE` em **Settings → Environment Variables**, depois **Redeploy**. Sem ela, a
tela de Plano mostra preço e prazo, mas não onde pagar.

### 2.3 Desligar o Stripe

As funções saíram do repositório, mas continuam publicadas até serem apagadas:

```powershell
supabase functions delete criar-checkout --project-ref ryygkiehthqjaivtafkg
supabase functions delete stripe-webhook --project-ref ryygkiehthqjaivtafkg
supabase secrets unset STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET STRIPE_PRICE_ID ALICERCE_SITE --project-ref ryygkiehthqjaivtafkg
```

No painel do Stripe: **cancele as assinaturas ativas** (senão o cartão continua sendo
cobrado) e apague o endpoint do webhook.

### 2.4 Liberar um Pix recebido

Ache o grupo de quem pagou:

```sql
select p.grupo_id, p.nome, a.status, a.vale_ate
from public.profiles p
left join public.assinaturas a on a.grupo_id = p.grupo_id
where p.nome ilike '%NOME%';
```

Libere 30 dias a partir do fim do prazo atual (ou de hoje, se já venceu):

```sql
insert into public.assinaturas (grupo_id, status, vale_ate, titular_id)
values ('GRUPO', 'pix', now() + interval '30 days', 'ID_DE_QUEM_PAGOU')
on conflict (grupo_id) do update
set status = 'pix',
    vale_ate = greatest(public.assinaturas.vale_ate, now()) + interval '30 days',
    titular_id = coalesce(public.assinaturas.titular_id, excluded.titular_id),
    atualizado_em = now();
```

O app avisa o titular 3 dias antes de vencer. Vencido, o grupo vira modo leitura até o
próximo Pix.

### ✅ Verificação da Parte 2

1. **Perfil → Plano** mostra o chip **pago**, a data e a chave Pix com botão Copiar
2. Um convidado vê "Você é convidado" e nenhuma chave
3. Quem vence consegue ver as obras mas não lançar

---

## Parte 3 — Rotina

### Quem vence nos próximos dias

```sql
select a.grupo_id, a.status, a.vale_ate, p.nome
from public.assinaturas a
join public.profiles p on p.id = a.titular_id
where a.vale_ate < now() + interval '7 days'
order by a.vale_ate;
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
| Endereço gravado no APK | `ALICERCE_SITE_URL` na hora de gerar |
| Chave Pix mostrada no app | `VITE_PIX_CHAVE` na Vercel |
| Quem tem plano | tabela `assinaturas`, liberada na mão pelo SQL Editor |
| Quem barra sem plano | `plano_ativo()` nas policies de insert (`0012`, regra em `0013`) |

## O que nunca fazer

- `supabase db push` neste projeto
- Tirar `alicerceobras.vercel.app` do ar
- Gravar secret sem republicar a função depois
