-- Ponte do login com Google para o app da Tela de Início do iPhone.
--
-- No app instalado pela Tela de Início, o iPhone abre o Google numa janela do Safari por cima
-- do app, e essa janela tem armazenamento próprio, separado do app. O login termina nela: o
-- código que o Google devolve chega lá, mas a outra metade da troca (o code verifier do
-- PKCE, que o Supabase guardou ao começar) ficou no app. Nenhum dos dois lados consegue
-- entrar sozinho.
--
-- A ponte junta as metades pelo servidor: a janela do Google entrega o código com o número da
-- ponte que o app sorteou; o app busca o código pelo mesmo número e faz a troca com o verifier
-- que só ele tem.
--
-- Por que é seguro deixar quem não entrou gravar e ler aqui: o código sozinho não serve para
-- nada — sem o verifier, o Supabase recusa a troca (é para isso que o PKCE existe). E o número
-- da ponte é um uuid sorteado no app, que ninguém adivinha. Cada código vale 10 minutos e é
-- lido uma vez só.
--
-- Pode colar inteira no SQL Editor e rodar de novo sem estragar nada.

create table if not exists public.pontes_login (
  ponte uuid primary key,
  codigo text not null check (length(codigo) between 8 and 512),
  criado_em timestamptz not null default now()
);

alter table public.pontes_login enable row level security;

-- Sem acesso direto, nem leitura: só pelas duas funções. A lição da 0010.
revoke all on public.pontes_login from anon, authenticated;

create or replace function public.entregar_codigo_login(p_ponte uuid, p_codigo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_ponte is null or p_codigo is null or length(p_codigo) not between 8 and 512 then
    raise exception 'código inválido';
  end if;

  -- Limpeza a cada entrega: código esquecido não passa de 10 minutos aqui dentro.
  delete from public.pontes_login where criado_em < now() - interval '10 minutes';

  -- Teto contra quem tentar encher a tabela chamando em laço. Gente de verdade entrando ao
  -- mesmo tempo não chega perto disto em 10 minutos.
  if (select count(*) from public.pontes_login) >= 500 then
    raise exception 'muitos logins ao mesmo tempo; tente de novo em alguns minutos';
  end if;

  -- A primeira entrega vale. Uma segunda, para a mesma ponte, não troca o código.
  insert into public.pontes_login (ponte, codigo) values (p_ponte, p_codigo)
  on conflict (ponte) do nothing;
end;
$$;

-- Devolve o código uma vez só, e já apaga. Nulo enquanto a janela do Google não entregou.
create or replace function public.buscar_codigo_login(p_ponte uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_codigo text;
begin
  delete from public.pontes_login
  where ponte = p_ponte and criado_em >= now() - interval '10 minutes'
  returning codigo into v_codigo;
  return v_codigo;
end;
$$;

-- Ao contrário das outras funções do app (0006/0007), estas são para quem AINDA não entrou: é
-- justamente no login que elas servem.
revoke all on function public.entregar_codigo_login(uuid, text) from public;
revoke all on function public.buscar_codigo_login(uuid) from public;
grant execute on function public.entregar_codigo_login(uuid, text) to anon, authenticated;
grant execute on function public.buscar_codigo_login(uuid) to anon, authenticated;
