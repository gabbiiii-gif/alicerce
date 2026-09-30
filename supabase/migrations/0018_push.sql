-- Aviso no celular com o app fechado (push).
--
-- A 0017 grava cada aviso na tabela notificacoes, e o app mostra enquanto está aberto. Esta
-- migration leva o mesmo aviso até o celular fechado:
--
--   1. o app registra o celular (o token do Firebase) em `dispositivos`;
--   2. cada linha nova em notificacoes chama a função `enviar-push`, pelo pg_net;
--   3. a função manda pelo Firebase Cloud Messaging para os celulares de quem recebe.
--
-- Nenhum texto novo nasce aqui: o push leva o mesmo título e corpo que a 0017 já grava. E a
-- regra de quem recebe continua a mesma — quem fez não recebe, de fora não recebe.
--
-- Roda DEPOIS da 0017. Pode colar inteira no SQL Editor e rodar de novo sem estragar nada.
-- Sem a função publicada, nada quebra: a chamada leva 404 e o aviso fica só no app.

do $$
begin
  if to_regclass('public.notificacoes') is null then
    raise exception 'Aplique a 0017_notificacoes.sql antes desta: o push manda os avisos que ela grava.';
  end if;
end;
$$;

-- O pg_net faz a chamada HTTP de dentro do banco, fora da transação: ela só sai depois do
-- commit, e se a escrita for desfeita a chamada some junto.
create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------- aparelhos

create table if not exists public.dispositivos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  -- Endereço do celular no Firebase. Único: um celular é de uma conta por vez.
  token text not null unique,
  plataforma text not null check (plataforma in ('android', 'ios', 'web')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists dispositivos_dono on public.dispositivos (user_id);

alter table public.dispositivos enable row level security;

-- Nenhum acesso direto pelo app, nem leitura: tudo passa pelas duas funções abaixo. A mesma
-- lição da 0010 — tabela nova em public nasce gravável pela API pública.
revoke all on public.dispositivos from anon, authenticated;

-- Registra este celular para a conta da sessão.
--
-- Security definer porque o celular pode trocar de dono: A saiu sem desligar (sem sinal na
-- hora de sair, por exemplo) e B entrou no mesmo aparelho. O token ainda está na linha de A,
-- que a RLS não deixaria B mexer — e A continuaria recebendo no celular de B os avisos das
-- próprias obras. Aqui o token passa para quem está com a sessão.
create or replace function public.registrar_dispositivo(p_token text, p_plataforma text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_eu uuid := auth.uid();
begin
  if v_eu is null then
    raise exception 'sem sessão';
  end if;
  if p_token is null or length(p_token) not between 20 and 4096 then
    raise exception 'token inválido';
  end if;
  if p_plataforma is null or p_plataforma not in ('android', 'ios', 'web') then
    raise exception 'plataforma inválida';
  end if;

  delete from public.dispositivos where token = p_token and user_id <> v_eu;

  insert into public.dispositivos (user_id, token, plataforma)
  values (v_eu, p_token, p_plataforma)
  on conflict (token) do update
  set plataforma = excluded.plataforma, atualizado_em = now();

  -- Teto de 10 aparelhos por pessoa. Token velho que o Firebase já descartou sai sozinho na
  -- primeira entrega que falhar; o teto é para ninguém encher a tabela chamando isto em laço.
  delete from public.dispositivos
  where id in (
    select id from public.dispositivos
    where user_id = v_eu
    order by atualizado_em desc
    offset 10
  );
end;
$$;

-- Desliga o aviso neste celular. Só apaga o que é da própria sessão: saber o token de outra
-- pessoa não dá poder de calar o celular dela.
create or replace function public.esquecer_dispositivo(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'sem sessão';
  end if;
  delete from public.dispositivos where token = p_token and user_id = auth.uid();
end;
$$;

revoke all on function public.registrar_dispositivo(text, text) from public, anon;
grant execute on function public.registrar_dispositivo(text, text) to authenticated;
revoke all on function public.esquecer_dispositivo(text) from public, anon;
grant execute on function public.esquecer_dispositivo(text) to authenticated;

-- ---------------------------------------------------------------- disparo

-- Marca que o push daquele aviso já foi. É a trava contra mandar duas vezes: a função só
-- manda se achar a coluna vazia, no mesmo update que a preenche. Por isso a função pode
-- ficar aberta, sem senha: chamada de novo, ou por fora com o id de um aviso qualquer, não
-- manda nada — e o id é um uuid, que ninguém adivinha.
alter table public.notificacoes add column if not exists push_em timestamptz;

-- O endereço da função `enviar-push` neste projeto. Projeto novo (SETUP.md): troque o
-- ryygkiehthqjaivtafkg pelo Project ID do seu, em Project Settings → General.
create or replace function public.dispara_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    -- Quem não tem celular registrado não gera chamada nenhuma. É o caso de todo mundo no
    -- site e de quem ainda está com o APK antigo.
    if exists (select 1 from public.dispositivos where user_id = new.user_id) then
      perform net.http_post(
        url := 'https://ryygkiehthqjaivtafkg.supabase.co/functions/v1/enviar-push',
        body := jsonb_build_object('id', new.id),
        headers := '{"Content-Type": "application/json"}'::jsonb,
        timeout_milliseconds := 10000
      );
    end if;
  exception when others then
    -- A regra da 0017 vale aqui também: aviso nunca derruba a escrita que o gerou.
    raise warning 'Alicerce: push não disparado (%)', sqlerrm;
  end;
  return null;
end;
$$;

-- Sem revoke em dispara_push(), pelo motivo da 0006: é função de trigger, não dá para chamar
-- pela API, e mexer na permissão dela arriscaria o insert em notificacoes.

drop trigger if exists dispara_push on public.notificacoes;
create trigger dispara_push
  after insert on public.notificacoes
  for each row execute function public.dispara_push();
