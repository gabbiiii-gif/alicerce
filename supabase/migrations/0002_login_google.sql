-- Login com Google.
--
-- Quem entra pelo Google não passa pelo formulário do app, então o nome não chega em
-- `nome`: chega em `full_name` (ou `name`), e junto vem a foto em `picture`/`avatar_url`.
-- Sem isto, todo usuário do Google viraria "biel.atm11" — o pedaço do e-mail antes do @.
--
-- Roda depois do 0001 e pode rodar de novo sem estragar nada.

alter table public.profiles add column if not exists avatar_url text;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_nome text;
  v_iniciais text;
begin
  v_nome := coalesce(
    nullif(trim(v_meta ->> 'nome'), ''),        -- cadastro por e-mail, feito no app
    nullif(trim(v_meta ->> 'full_name'), ''),   -- Google
    nullif(trim(v_meta ->> 'name'), ''),        -- Google, formato antigo
    split_part(new.email, '@', 1)
  );

  v_iniciais := upper(
    coalesce(substr(split_part(v_nome, ' ', 1), 1, 1), '') ||
    coalesce(nullif(substr(split_part(v_nome, ' ', 2), 1, 1), ''), substr(split_part(v_nome, ' ', 1), 2, 1))
  );

  insert into public.profiles (id, nome, iniciais, avatar_url)
  values (
    new.id,
    v_nome,
    coalesce(nullif(v_iniciais, ''), '?'),
    nullif(trim(coalesce(v_meta ->> 'avatar_url', v_meta ->> 'picture')), '')
  )
  on conflict (id) do nothing;

  -- Categorias de partida, para a primeira obra já ter onde classificar.
  insert into public.categorias (dono_id, criado_por, nome)
  select new.id, new.id, nome
  from unnest(array['Material', 'Mão de obra', 'Equipamento', 'Frete', 'Taxas e alvarás']) as nome
  on conflict (dono_id, nome) do nothing;

  return new;
end;
$$;
