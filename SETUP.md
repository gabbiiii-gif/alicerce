# Ligando o Alicerce

Três blocos, nesta ordem: **banco** → **login** → **agente**. O empacotamento em APK/IPA
fica no fim, e só faz sentido depois que o app funcionar no navegador.

---

## 1. Banco de dados

Painel do Supabase → **SQL Editor** → New query:

1. Cole o conteúdo inteiro de `supabase/migrations/0001_init.sql` → **Run**.
2. Nova query, cole `supabase/migrations/0002_login_google.sql` → **Run**.

O `0001` cria as 8 tabelas (`profiles`, `obras`, `obra_membros`, `categorias`, `aditivos`,
`comprovantes`, `lancamentos`, `convites`), as policies de RLS, os triggers e o bucket
privado `comprovantes`. O `0002` ensina o banco a ler o nome e a foto de quem entra pelo
Google — sem ele, todo usuário do Google viraria o pedaço do e-mail antes do `@`.

Cada um deve terminar com **Success. No rows returned**. Se algum falhar, me mande a
mensagem de erro — não rode pela metade nem conserte por cima.

Conferir: **Table Editor** lista as 8 tabelas, e **Storage** mostra `comprovantes` privado.

## 2. Conectar o app ao Supabase

Painel → **Project Settings → API**:

- **Project URL** → `VITE_SUPABASE_URL`
- **anon public** → `VITE_SUPABASE_ANON_KEY`

```bash
cp .env.example .env
# preencha as duas linhas
npm install
npm run dev
```

A anon key é pública por natureza (vai embutida no app, inclusive no APK) — quem protege os
dados é a RLS do passo 1. **A `service_role` key não entra em lugar nenhum do app.**

## 3. Login com Google

São duas pontas: um cliente OAuth no Google e o provider ligado no Supabase.

### 3.1 No Google Cloud Console

console.cloud.google.com, com a conta que vai ser dona do app.

1. Crie um projeto chamado **Alicerce** (menu de projetos no topo → New project).
2. Menu → **APIs e serviços → Tela de permissão OAuth** (ou **Google Auth Platform →
   Branding**). Preencha:
   - Nome do app: `Alicerce`
   - E-mail de suporte: o seu
   - Tipo de usuário / público-alvo: **Externo**
   - Domínio e e-mail do desenvolvedor: os seus
3. Em **Público-alvo**, enquanto estiver testando, adicione os e-mails que vão usar o app
   em **Usuários de teste**. Sem isso o Google barra quem não está na lista. Quando for
   abrir para o público, clique em **Publicar app**.
4. Menu → **Credenciais → Criar credenciais → ID do cliente OAuth**:
   - Tipo: **Aplicativo da Web**
   - Nome: `Alicerce Web`
   - **Origens JavaScript autorizadas**:
     - `http://localhost:5173`
     - `https://alicerceobras.vercel.app`
   - **URIs de redirecionamento autorizados** — exatamente um, o do Supabase:
     - `https://SEU_PROJECT_REF.supabase.co/auth/v1/callback`
5. Copie o **ID do cliente** e o **Chave secreta do cliente**.

> Não precisa criar um cliente OAuth do tipo Android. O APK abre o navegador do sistema,
> que volta para o Supabase e de lá para o app — quem fala com o Google é sempre o
> cliente Web.

### 3.2 No painel do Supabase

**Authentication → Sign In / Providers → Google**:

- Ligue o provider.
- Cole **Client ID** e **Client Secret**.
- Salve.

**Authentication → URL Configuration**:

- **Site URL**: `https://alicerceobras.vercel.app` (é para onde o Supabase manda quem
  clica em link de e-mail; use `http://localhost:5173` só enquanto estiver testando local).
- **Redirect URLs** (lista de permissão) — adicione as três:
  - `http://localhost:5173/login`
  - `https://alicerceobras.vercel.app/login`
  - `app.alicerce://login` ← **essencial para o APK e o iPhone**

Sem a terceira linha, o login funciona no navegador e trava no app empacotado.

### 3.3 E-mail e senha

Continua ligado, para quem não quiser usar Google. Em **Sign In / Providers → Email**:
desligue **Confirm email** enquanto testa; religue para produção.

## 4. Agente que lê os comprovantes

Precisa da CLI do Supabase (`npm i -g supabase`):

```bash
supabase login
supabase link --project-ref SEU_PROJECT_REF
supabase functions deploy ler-comprovante
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```

Opcional: `supabase secrets set ALICERCE_MODELO=claude-opus-5` (o padrão é
`claude-sonnet-5`).

A chave sai de console.anthropic.com → API Keys. Ela fica só no servidor do Supabase,
nunca no app.

## 5. Primeiro teste, na ordem

1. **Continuar com Google** na tela de login.
2. Criar uma obra: nome, valor fechado e entrada — a obra só nasce com entrada.
3. Painel → **+ saída** → foto ou PDF de uma nota real. A fila mostra "lendo a nota…" e
   vira "revisar" quando o agente termina.
4. Conferir o que ele leu, ajustar, **Confirmar** → cai no histórico da obra.
5. **Relatórios** → PDF.
6. **Equipe → + convidar alguém** → mandar o link para a segunda pessoa.

---

## 6. Publicar na Vercel

Endereço final: **https://alicerceobras.vercel.app**

No painel da Vercel, projeto apontado para `github.com/gabbiiii-gif/alicerce`:

- **Root Directory**: deixe na raiz (`./`) — o app está na raiz do repositório
- **Framework Preset**: Vite — Build `npm run build`, Output `dist`
- **Environment Variables**, as mesmas duas do `.env`, em Production e Preview:
  - `VITE_SUPABASE_URL` = `https://ryygkiehthqjaivtafkg.supabase.co`
  - `VITE_SUPABASE_ANON_KEY` = a publishable key

O `.env` é ignorado pelo git de propósito, então essas duas variáveis **precisam** ser
cadastradas na Vercel — senão o site publicado abre na tela "Falta ligar o servidor".

O `vercel.json` na raiz do app manda toda rota para o `index.html`. Sem ele, abrir
`alicerceobras.vercel.app/obra/algum-id` direto, ou dar F5 numa tela interna, devolve 404 —
e o link de convite (`/e/CODIGO`), que é justamente o que se manda para outra pessoa,
nunca abriria.

Depois de publicar, confira que os três endereços do passo 3.2 estão lá: o domínio nas
origens do Google, e `https://alicerceobras.vercel.app/login` nas Redirect URLs do Supabase.

## 7. Virar APK e app de iPhone

O projeto já está empacotado com Capacitor: `android/` e `ios/` existem e apontam para o
mesmo `dist` que roda no navegador.

### Android (APK)

Precisa, na máquina:

- **JDK 21** (Temurin ou o que vem com o Android Studio)
- **Android Studio** com o SDK Platform 35 e o Build-Tools instalados

```bash
npm run android:abrir     # compila o site, sincroniza e abre o Android Studio
```

No Android Studio: **Build → Build Bundle(s)/APK(s) → Build APK(s)**. O arquivo sai em
`android/app/build/outputs/apk/debug/app-debug.apk` — esse é instalável direto no celular.

Pela linha de comando, com o JDK no PATH:

```bash
npm run android:apk
```

Para a Play Store é preciso um APK/AAB **assinado**: gerar uma keystore
(`keytool -genkey -v -keystore alicerce.keystore -alias alicerce -keyalg RSA -validity 10000`)
e apontar ela em `android/key.properties`. Não versione a keystore.

### iPhone

Só compila em Mac, com Xcode:

```bash
npm run ios:abrir
```

E publicar exige a conta de desenvolvedor da Apple (US$ 99/ano).

### Depois de qualquer mudança no código

```bash
npm run sync
```

Isso recompila o site e copia para dentro dos dois projetos nativos.

---

## Se der errado

| Sintoma | Causa provável |
| --- | --- |
| Tela "Falta ligar o servidor" | `.env` vazio ou sem as duas linhas |
| "O login com Google ainda não está ligado no Supabase" | Provider Google desligado no painel |
| Google mostra "redirect_uri_mismatch" | O URI no Google Cloud não é `https://SEU_PROJECT_REF.supabase.co/auth/v1/callback` |
| Google mostra "acesso bloqueado / app não verificado" | Seu e-mail não está em Usuários de teste, ou o app não foi publicado |
| Login volta para a tela de login sem entrar | A URL de retorno não está na lista de **Redirect URLs** do Supabase |
| No APK o navegador abre e não volta | Falta `app.alicerce://login` nas Redirect URLs |
| Usuário do Google aparece com nome errado | O `0002_login_google.sql` não rodou |
| Fila trava em "lendo a nota…" | Função não publicada ou `ANTHROPIC_API_KEY` faltando — ver Edge Functions → Logs |
| Nota vira "não deu para ler" | O agente respondeu com erro; a mensagem fica no card e dá para preencher na mão |
| "new row violates row-level security" | O SQL do passo 1 não rodou inteiro |
