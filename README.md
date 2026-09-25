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

## Desempenho (PageSpeed 100)

A tela de entrada nota 100 nas quatro categorias do PageSpeed, no celular e no computador.
O que sustenta isso, e o que derruba se for desfeito:

- **A abertura é HTML puro** (`index.html`): pinta no primeiro quadro, antes de qualquer
  JavaScript. Quem a tira é `src/lib/abertura.ts`, quando a primeira tela monta atrás.
- **O CSS vai dentro do HTML** e o JavaScript de entrada tem prioridade baixa
  (`vite.config.ts`, plugin `primeiraPintura`).
- **Fontes servidas pelo app** (`public/fonts`, com cache de um ano): trocar um arquivo
  exige trocar o nome. Elas entram depois do primeiro quadro (classe `.fontes`).
- **Só a primeira tela viaja no primeiro carregamento.** As demais entram por `sobDemanda`
  em `src/App.tsx`. Tela nova vai para a tabela `PROTEGIDAS`, nunca por import direto.
- **O Supabase não está no caminho da primeira tela.** Quem precisa dele ali usa
  `carregarSupabase()` (`src/lib/sessao.ts`). Importar `lib/supabase` ou `data/api` direto
  de `main.tsx`, `App.tsx`, `lib/auth.tsx`, `lib/plano.tsx`, `Login`, `Intro`, `Tela` ou
  `Toast` traz de volta 60 KB para a abertura.
- **Animação com `m.div`, não `motion.div`.** O `<LazyMotion strict>` do `main.tsx`
  acusa o erro em desenvolvimento.

Para medir: [PageSpeed Insights](https://pagespeed.web.dev/) no endereço publicado, aba
Celular. A nota varia alguns pontos de uma rodada para outra; vale a mediana de três.

## Rodando local

```bash
npm install
cp .env.example .env      # preencha com a URL e a anon key do projeto Supabase
npm run dev
```

## Ligando o backend

Roteiro completo em [`SETUP.md`](./SETUP.md). Para ligar o domínio próprio e liberar
pagamentos por Pix, [`PRODUCAO.md`](./PRODUCAO.md). Em resumo:

1. Criar o projeto (região `sa-east-1` para latência no Brasil).
2. Aplicar `supabase/migrations/0001_init.sql` no SQL Editor, ou `supabase db push` com a CLI.
   Cria tabelas, policies, triggers e o bucket privado `comprovantes`.
3. Em Authentication → Providers, manter e-mail/senha ligado. Para testar rápido, desligar
   "Confirm email"; para produção, deixar ligado.
4. `supabase functions deploy ler-comprovante` e `supabase secrets set ANTHROPIC_API_KEY=sk-ant-...`.
5. Copiar Project URL e anon key para o `.env` do app (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
6. `npm run dev`, criar as duas contas e usar o botão "+ convidar alguém" na tela Equipe para
   ligar o segundo usuário à obra.

## Banco

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
# opcional: ALICERCE_MODELO — padrão claude-sonnet-5
```

Modelo padrão: `claude-sonnet-5`. Trocar por `claude-opus-5` se aparecerem notas difíceis
(amassadas, manuscritas, foto ruim) ou `claude-haiku-4-5` para baratear volume alto.

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
