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

## Parte 2 — Pix pelo Mercado Pago

O titular gera o Pix na tela **Perfil → Plano**, paga no banco e o plano estende um mês
sozinho. Dois caminhos confirmam o pagamento: o aviso do Mercado Pago (`mercadopago-webhook`)
e a própria tela, que confere a cada 5 segundos enquanto o QR está aberto. Qualquer um dos
dois basta; a `creditar_pix()` garante que o mês é somado uma vez só.

**Vencimento:** todo dia 22. Quem pagou em 22/09 fica até o fim de 22/10. Cada Pix soma um
mês ao fim do prazo atual — pagar adiantado não perde dias. Quem deixa vencer e paga depois
ganha um mês a partir do dia do pagamento (o dia de vencimento muda para o dele).

### 2.1 Aplicar as migrations, nesta ordem

Cole no SQL Editor:

1. `supabase/migrations/0013_pagamento_pix.sql` — todos os grupos viram `pix`, pagos até 22/10
2. `supabase/migrations/0014_mercado_pago.sql` — tabela `pagamentos` e `creditar_pix()`

Se a `0013` já tinha rodado com o prazo antigo, a `0014` acerta a data para 22/10.

### 2.2 Conta do Mercado Pago

1. A conta precisa ter **uma chave Pix cadastrada** (app do Mercado Pago → Pix → Minhas
   chaves). Sem ela, a API recusa gerar o QR.
2. [Suas integrações](https://www.mercadopago.com.br/developers/panel/app) → **Criar
   aplicação** → tipo *Pagamentos online*, *Checkout Transparente*.
3. Na aplicação, **Credenciais de produção** → copie o **Access Token** (`APP_USR-...`).

### 2.3 Secret e deploy

**Sem terminal (pelo painel do Supabase).** Cada função é um arquivo só, feito para colar:

1. **Edge Functions → Secrets** → adicionar `MP_ACCESS_TOKEN` com o `APP_USR-...`
2. **Edge Functions → Deploy a new function → Via Editor**, nome `pix`. Apague o código de
   exemplo, cole `supabase/functions/pix/index.ts` inteiro e publique.
3. Mesma coisa com o nome `mercadopago-webhook` e o arquivo
   `supabase/functions/mercadopago-webhook/index.ts`.
4. Na `mercadopago-webhook`, em **Details**, **desligue a verificação de JWT** e salve.
   Ligada, o aviso do Mercado Pago leva 401 e o plano só libera com a tela aberta.
5. Apague `criar-checkout` e `stripe-webhook` na lista de funções.

**Com terminal** (precisa do Node; sem a CLI instalada, use `npx supabase` no lugar de
`supabase`):

```powershell
supabase secrets set MP_ACCESS_TOKEN=APP_USR-... --project-ref ryygkiehthqjaivtafkg
supabase functions deploy pix --project-ref ryygkiehthqjaivtafkg
supabase functions deploy mercadopago-webhook --project-ref ryygkiehthqjaivtafkg --no-verify-jwt
```

Não precisa configurar webhook no painel do Mercado Pago: cada Pix já leva o endereço de
aviso. Não cole o `APP_USR-` em conversa, arquivo ou commit.

### 2.4 Desligar o Stripe

As funções antigas continuam publicadas até serem apagadas:

```powershell
supabase functions delete criar-checkout --project-ref ryygkiehthqjaivtafkg
supabase functions delete stripe-webhook --project-ref ryygkiehthqjaivtafkg
supabase secrets unset STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET STRIPE_PRICE_ID ALICERCE_SITE --project-ref ryygkiehthqjaivtafkg
```

No painel do Stripe: **cancele as assinaturas ativas** (senão o cartão continua sendo
cobrado) e apague o endpoint do webhook.

### ✅ Verificação da Parte 2

1. **Perfil → Plano** mostra o chip **pago** e "Pago até 22/10/2026"
2. **Pagar o próximo mês com Pix** mostra o QR e o botão de copiar
3. Pague com o seu banco (R$ 150 de verdade — vira mais um mês no seu próprio plano)
4. Em alguns segundos a tela diz "Pagamento confirmado. Plano até 22/11/2026"
5. No SQL Editor, `select status, pago_em, vale_ate_concedido from pagamentos order by criado_em desc limit 1;`
   mostra `approved` com as datas preenchidas

Se o passo 4 não acontecer: **Edge Functions → pix → Logs** mostra o que o Mercado Pago
respondeu.

---

## Parte 3 — Notificações

Aviso para o sócio de tudo que o outro lança ou muda. O app publicado já tem o sino; sem a
migration, ele fica em zero e a tela diz que as notificações ainda não foram ligadas — nada
quebra se o deploy chegar antes do SQL.

### 3.1 Aplicar a migration

Depois da `0016`, cole no SQL Editor `supabase/migrations/0017_notificacoes.sql` → **Run**.
Sem a `0016`, ela para logo no começo com a mensagem dizendo isso, sem criar nada.

Ela também põe a tabela `notificacoes` na publicação `supabase_realtime`. Confira em
**Database → Publications → supabase_realtime**: `notificacoes` tem que estar marcada.

### ✅ Verificação da Parte 3

Com duas contas sócias, cada uma num aparelho (ou uma no celular e outra no computador):

1. A conta A abre o **Painel** de uma obra
2. A conta B lança uma saída nessa obra
3. Em até 2 segundos, na A: aviso "B lançou uma saída de R$ …", número **1** no sino e o
   lançamento novo na lista, sem recarregar
4. A toca no sino: a notificação aparece destacada e o número some
5. A conta B **não** recebe aviso do próprio lançamento

Se o passo 3 só acontecer ao sair e voltar para o app, o Realtime não está entregando: confira
a publicação (3.1). O app segue funcionando, só sem o "na hora".

---

## Parte 4 — Aviso com o app fechado (push)

O mesmo aviso da Parte 3 chega no Android com o app fechado, com a cara do Alicerce: nome da
obra no título, o que aconteceu com o valor logo abaixo, ícone da marca, azul do app e um toque
próprio. Tocar no aviso abre a obra.

São dois arquivos do Firebase, e eles **não são a mesma coisa**:

| Arquivo | Para que serve | É segredo? | Onde fica |
|---|---|---|---|
| `google-services.json` | Diz ao APK de qual projeto do Firebase ele é | Não | No repositório, em `android/app/` |
| Chave da conta de serviço (JSON) | Dá ao servidor o direito de **mandar** push | **Sim** | Só no secret `FCM_SERVICE_ACCOUNT` do Supabase |

### 4.1 Firebase: o app Android (`google-services.json`)

1. [console.firebase.google.com](https://console.firebase.google.com) → projeto do Alicerce →
   engrenagem **Configurações do projeto** → aba **Geral** → em **Seus apps**, o ícone do Android.
2. **Nome do pacote Android:** `app.alicerce`, exatamente assim. É o `appId` do
   `capacitor.config.ts`; com outro nome o Firebase não reconhece o APK e o push não chega.
3. **Apelido:** `Alicerce`. **SHA-1:** deixe em branco (serve para login com Google e links
   dinâmicos; push não usa).
4. **Registrar app** → **Baixar google-services.json**.
5. As telas seguintes ("Adicionar o SDK do Firebase") ensinam a mexer no Gradle: **pule**, o
   projeto já está pronto. Avance até **Continuar no console**.
6. Mova o arquivo baixado para `android/app/google-services.json`. O nome tem que ser esse: se o
   navegador salvou como `google-services (1).json`, renomeie.
7. Commit e push. O build do APK no GitHub sai de uma cópia limpa do repositório e precisa do
   arquivo lá.

Não é segredo: ele só identifica o projeto, e o aparelho de qualquer usuário recebe uma cópia
dentro do APK. Com ele não se manda push para ninguém. Para fechar mais, dá para restringir a
chave de API dele ao app Android em Google Cloud → APIs e serviços → Credenciais.

Sem o arquivo, **o build do APK para** com a mensagem "Falta android/app/google-services.json".
É de propósito: num APK sem Firebase, ligar o aviso fecha o app na mão da pessoa.

### 4.2 Firebase: a chave para mandar (`FCM_SERVICE_ACCOUNT`)

1. Firebase → **Configurações do projeto** → aba **Contas de serviço** → **Gerar nova chave
   privada** → confirma. Baixa um JSON.
2. **Este é segredo:** quem tiver o arquivo manda push em nome do Alicerce. Não vai para o
   repositório, nem para conversa.
3. Supabase → **Edge Functions → Secrets** → **Add new secret**: nome `FCM_SERVICE_ACCOUNT`,
   valor o conteúdo inteiro do arquivo (abra no Bloco de Notas, `Ctrl+A`, `Ctrl+C`, cole).
4. Apague o arquivo baixado, ou guarde fora da pasta do projeto.

Pelo terminal, sem abrir o arquivo (em base64, que a função também aceita):

```powershell
$chave = [Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\caminho\da\chave.json"))
npx supabase secrets set "FCM_SERVICE_ACCOUNT=$chave" --project-ref ryygkiehthqjaivtafkg
```

### 4.3 Banco e função

1. SQL Editor → cole `supabase/migrations/0018_push.sql` → **Run**. Depois da `0017`; sem ela, a
   0018 para logo no começo, sem criar nada. Liga o `pg_net`, cria a tabela `dispositivos` e o
   gatilho que chama a função a cada aviso novo.
2. **Edge Functions → Deploy a new function → Via Editor**, nome `enviar-push`, cole
   `supabase/functions/enviar-push/index.ts` inteiro e publique.
3. Em **Details** da `enviar-push`, **desligue a verificação de JWT** e salve. Quem chama é o
   banco, sem sessão de ninguém; a trava contra repetição é a coluna `notificacoes.push_em`.

Com terminal:

```powershell
npx supabase functions deploy enviar-push --project-ref ryygkiehthqjaivtafkg --no-verify-jwt
```

A ordem entre 4.1, 4.2 e 4.3 não importa: sem a função, o gatilho leva 404 e o aviso fica só no
app; sem a 0018, o app não consegue registrar o celular e segue sem push.

### 4.4 APK novo

O push depende de uma peça nativa, então cada pessoa instala o APK novo **uma vez**: GitHub →
**Actions** → último **APK do Android** verde → **alicerce-apk**. Se o Android recusar instalar
por cima, desinstale o antigo antes (os dados estão no servidor, nada se perde).

Quem continuar com o APK antigo segue usando o app normalmente, só sem push. Em **Perfil**, a
linha **Aviso no celular** diz "atualizar".

### ✅ Verificação da Parte 4

1. Abra o APK novo e entre. O Android pergunta se o Alicerce pode mandar notificações →
   **Permitir**. (No Android 12 ou mais antigo não pergunta: já vem permitido.)
2. **Perfil → Aviso no celular** mostra **ligado**.
3. No SQL Editor, `select user_id, plataforma, atualizado_em from dispositivos;` mostra o celular.
4. Feche o app de verdade (tire da lista de recentes).
5. Do outro aparelho, o sócio lança uma saída numa obra.
6. Em alguns segundos: aviso com o ícone do Alicerce e o toque próprio, título com o nome da
   obra e "Gabriel lançou uma saída de R$ …" embaixo. Tocar abre o Painel dessa obra.

Se o aviso não chegar:

- **Edge Functions → enviar-push → Logs** mostra o que o Firebase respondeu.
- No SQL Editor,
  `select status_code, content from net._http_response order by created desc limit 5;` mostra o
  que a função respondeu ao banco. `FCM_SERVICE_ACCOUNT não configurado` é o passo 4.2; 401 é a
  verificação de JWT ligada (4.3, item 3).
- O som próprio fica gravado no canal da primeira vez que o aviso é ligado. Se o celular já
  tinha o canal de um teste antigo, desinstale e instale o APK de novo.

---

## Parte 5 — Rotina

### Quem vence nos próximos dias

```sql
select a.grupo_id, a.status, a.vale_ate, p.nome
from public.assinaturas a
join public.profiles p on p.id = a.titular_id
where a.vale_ate < now() + interval '7 days'
order by a.vale_ate;
```

Pix que caiu na conta mas não liberou (raro — os dois caminhos falharam): ache o
`mp_payment_id` no app do Mercado Pago e rode `select public.creditar_pix('ID', 150);`.

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
| Token do Mercado Pago | secret `MP_ACCESS_TOKEN` no Supabase |
| Quem tem plano | tabela `assinaturas`, estendida por `creditar_pix()` (`0014`) |
| Histórico de Pix | tabela `pagamentos` |
| Quem barra sem plano | `plano_ativo()` nas policies de insert (`0012`, regra em `0013`) |
| Quem gera as notificações | triggers `notifica_*` nas tabelas da obra (`0017`) |
| Quem manda o push | trigger `dispara_push` (`0018`) → função `enviar-push` → Firebase |
| Chave para mandar push | secret `FCM_SERVICE_ACCOUNT` no Supabase |
| Firebase dentro do APK | `android/app/google-services.json` (no repositório) |
| Celulares que recebem push | tabela `dispositivos` |

## O que nunca fazer

- `supabase db push` neste projeto
- Tirar `alicerceobras.vercel.app` do ar
- Gravar secret sem republicar a função depois
