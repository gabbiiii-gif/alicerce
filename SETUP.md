# Ligando o Alicerce ao Supabase

Projeto: `ryygkiehthqjaivtafkg`

Roteiro para rodar uma vez, no painel do Supabase. Leva ~15 minutos.

---

## 1. Criar as tabelas

Painel → **SQL Editor** → New query → colar o conteúdo inteiro de
`supabase/migrations/0001_init.sql` → **Run**.

Cria: `profiles`, `obras`, `obra_membros`, `categorias`, `aditivos`, `comprovantes`,
`lancamentos`, `convites`, as policies de RLS, os triggers e o bucket privado `comprovantes`.

Deve terminar com **Success. No rows returned**. Se algum comando falhar, me mande a mensagem
de erro — não rode o arquivo pela metade nem tente consertar por cima.

Conferir depois: **Table Editor** deve listar as 8 tabelas, e **Storage** deve ter o bucket
`comprovantes` marcado como privado.

## 2. Autenticação

Painel → **Authentication → Sign In / Providers**:

- **Email** ligado.
- Para testar rápido hoje: desligue **Confirm email**. Para produção, religue.

Painel → **Authentication → URL Configuration**:

- **Site URL**: `http://localhost:5173` enquanto testa; a URL real depois que publicar.

## 3. Publicar o agente de leitura

Precisa da CLI do Supabase (`npm i -g supabase`) e do projeto linkado:

```bash
supabase login
supabase link --project-ref ryygkiehthqjaivtafkg
supabase functions deploy ler-comprovante
```

Depois, a chave da API da Claude — painel → **Edge Functions → Secrets**, ou pela CLI:

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```

Opcional: `supabase secrets set ALICERCE_MODELO=claude-opus-5` se quiser trocar o modelo
(o padrão é `claude-sonnet-5`).

> A chave da Claude sai de console.anthropic.com → API Keys. Ela fica só no servidor do
> Supabase, nunca no app.

## 4. Conectar o app

Painel → **Project Settings → API**. Copie:

- **Project URL** → `VITE_SUPABASE_URL`
- **anon public** → `VITE_SUPABASE_ANON_KEY`

```bash
cp .env.example .env
# preencha as duas linhas
npm install
npm run dev
```

A anon key é pública por natureza (vai embutida no app) — quem protege os dados é a RLS do
passo 1. **A `service_role` key não entra em lugar nenhum do app.**

## 5. Primeiro teste, na ordem

1. Criar sua conta na tela de login ("criar conta").
2. Criar uma obra: nome, valor fechado e entrada — a obra só nasce com entrada.
3. Painel → **+ saída** → tirar foto ou subir PDF de uma nota real.
   A fila mostra "lendo a nota…" e vira "revisar" quando o agente termina (alguns segundos).
4. Conferir o que ele leu, ajustar se preciso, **Confirmar** → cai no histórico da obra.
5. **Relatórios** → PDF.
6. **Equipe → + convidar alguém** → mandar o link para o segundo usuário, que cria a conta
   dele e abre o link. A partir daí os dois veem o mesmo histórico, cada linha marcada com
   quem enviou.

## Se der errado

| Sintoma | Causa provável |
| --- | --- |
| Login não passa | "Confirm email" ligado e e-mail não confirmado |
| Fila trava em "lendo a nota…" | Função não publicada ou `ANTHROPIC_API_KEY` faltando — ver Edge Functions → Logs |
| Nota vira "não deu para ler" | O agente respondeu com erro; a mensagem fica no card e dá para preencher na mão |
| "new row violates row-level security" | O SQL do passo 1 não rodou inteiro |
