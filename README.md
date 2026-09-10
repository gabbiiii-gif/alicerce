# Alicerce

App de organização de obras e gastos para engenheiros e construtoras pequenas.
Cada obra tem valor fechado, entrada obrigatória, saldo em aberto e aditivos por fora.
Duas pessoas dividem a mesma obra: o histórico é compartilhado (todo lançamento mostra
quem enviou) e só quem lançou pode apagar.

Implementação do protótipo aprovado no Claude Design (`Alicerce App.dc.html`).

## Stack

- **PWA** — React 19 + TypeScript + Vite, instalável no celular (app nativo fica para uma fase seguinte)
- **Supabase** — Postgres com RLS, Auth por e-mail/senha e Storage para os comprovantes
- **Agente de leitura** — Edge Function que manda a nota para a API da Claude (visão) e devolve
  fornecedor, valor, data e sugestão de categoria; o usuário confere antes de virar lançamento

## Rodando local

```bash
npm install
cp .env.example .env      # preencha com a URL e a anon key do projeto Supabase
npm run dev
```

## Banco

`supabase/migrations/0001_init.sql` cria tabelas, policies, triggers e o bucket `comprovantes`.
Aplicar com a CLI do Supabase (`supabase db push`) ou colando no SQL Editor do projeto.

Tabelas: `profiles`, `obras`, `obra_membros`, `categorias`, `aditivos`, `comprovantes`
(fila do agente), `lancamentos`, `convites`.

Regras que a RLS garante:

- só membros da obra leem a obra e o histórico dela
- editar/apagar lançamento e aditivo: só o autor
- a fila de comprovantes é pessoal até virar lançamento
- categorias são a lista do dono da obra, compartilhada com quem participa dela

## Agente de leitura de comprovantes

```bash
supabase functions deploy ler-comprovante
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
# opcional: ALICERCE_MODELO=claude-opus-5 (padrão) — sonnet ou haiku saem mais barato por nota
```

Fluxo: o app sobe o arquivo para o Storage, cria a linha em `comprovantes` com status `lendo`,
chama a função e mostra "lendo a nota…" na fila. A função baixa o arquivo, chama a Claude com
saída estruturada e grava `extraido` com status `pronto`. Se falhar, a nota fica como `erro` e o
usuário preenche na mão — nada se perde.

## Telas

Login · Minhas obras · Nova obra (3 passos, entrada obrigatória) · Painel da obra ·
Enviar comprovante · Conferir lançamento · Relatório (semana/mês, por categoria, por pessoa, PDF) ·
Perfil · Categorias · Equipe e convite · Encerrar obra.

## Ainda fora do escopo

- WhatsApp e e-mail como canal de entrada de notas e de envio de resumo (decidido para depois)
- App nativo (React Native), relatório automático agendado por e-mail
