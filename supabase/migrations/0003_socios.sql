-- Sociedade: quem entra por convite passa a ver TODAS as obras do grupo, e as futuras.
--
-- Antes, um convite dava acesso a uma obra só, e cada obra nova precisava de outro
-- convite. Agora o vínculo é entre pessoas: aceitar um convite junta as duas no mesmo
-- grupo, e todo mundo do grupo vê tudo de todo mundo — inclusive o que for criado depois.
--
-- O truque para isso não virar uma reescrita das ~20 policies: elas já passam todas por
-- `e_membro()` e `e_dono()`. Redefinindo essas duas funções, a regra nova vale em obras,
-- lançamentos, aditivos, comprovantes, categorias, convites e no storage de uma vez.

-- ---------------------------------------------------------------- grupo

-- Cada perfil nasce sozinho no próprio grupo (grupo_id = o próprio id). Quem nunca
-- aceitar convite continua exatamente como hoje: só as obras dele.
alter table public.profiles add column if not exists grupo_id uuid;
update public.profiles set grupo_id = id where grupo_id is null;
alter table public.profiles alter column grupo_id set not null;
create index if not exists profiles_grupo_id_idx on public.profiles (grupo_id);

-- SEGURANÇA — sem isto a sociedade seria auto-atribuível.
--
-- A policy "edita o próprio perfil" deixa qualquer um dar update na própria linha. Como o
-- grupo_id é o que decide quem vê as finanças de quem, bastaria um
--   update profiles set grupo_id = '<grupo alheio>' where id = auth.uid()
-- pela API pública para passar a enxergar todas as obras, lançamentos e comprovantes
-- daquele grupo. A RLS não barra: a linha é mesmo dele.
--
-- Não adianta `revoke update (grupo_id)`: no Postgres o privilégio de tabela e o de coluna
-- são independentes, e quem tem UPDATE na tabela inteira continua podendo escrever em
-- qualquer coluna. O jeito correto é tirar o UPDATE da tabela e devolvê-lo apenas nas
-- colunas que a pessoa realmente edita.
revoke update on public.profiles from authenticated;
revoke update on public.profiles from anon;
grant update (nome, iniciais, avatar_url) on public.profiles to authenticated;

-- A troca de grupo passa a acontecer só dentro de aceitar_convite(), que roda como dona
-- da tabela (security definer) e por isso não esbarra nesta permissão.

-- Quem já entrou por convite antes desta mudança vira sócio do dono daquela obra —
-- senão a sociedade valeria só para convites futuros e todos os vínculos já aceitos
-- teriam de ser refeitos à mão.
update public.profiles p
set grupo_id = dono.grupo_id
from public.obra_membros m
join public.obras o on o.id = m.obra_id
join public.profiles dono on dono.id = o.dono_id
where p.id = m.user_id
  and m.user_id <> o.dono_id
  and p.grupo_id = p.id;

-- ---------------------------------------------------------------- helpers

create or replace function public.mesmo_grupo(p_user uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles eu, public.profiles outro
    where eu.id = auth.uid() and outro.id = p_user and eu.grupo_id = outro.grupo_id
  );
$$;

-- Membro da obra: quem foi posto nela, ou qualquer sócio do dono.
create or replace function public.e_membro(p_obra uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.obra_membros m
    where m.obra_id = p_obra and m.user_id = auth.uid()
  ) or exists (
    select 1 from public.obras o
    where o.id = p_obra and public.mesmo_grupo(o.dono_id)
  );
$$;

-- Sócio tem o mesmo poder do dono: cria, edita e encerra obra do grupo.
-- Lançamento segue sendo do autor — só quem lançou apaga o que lançou.
create or replace function public.e_dono(p_obra uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.obras o
    where o.id = p_obra and (o.dono_id = auth.uid() or public.mesmo_grupo(o.dono_id))
  );
$$;

-- A lista de categorias passa a ser a do grupo, não a de cada dono isolado.
create or replace function public.meus_donos()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select auth.uid()
  union
  select p.id from public.profiles p
  where p.grupo_id = (select grupo_id from public.profiles where id = auth.uid())
  union
  select o.dono_id
  from public.obras o
  join public.obra_membros m on m.obra_id = o.id
  where m.user_id = auth.uid();
$$;

-- Preciso ver o nome e a foto de quem divide obra comigo — agora, de todo o grupo.
create or replace function public.compartilha_obra(p_user uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.mesmo_grupo(p_user) or exists (
    select 1
    from public.obra_membros meu
    join public.obra_membros dele on dele.obra_id = meu.obra_id
    where meu.user_id = auth.uid() and dele.user_id = p_user
  );
$$;

-- ---------------------------------------------------------------- poderes de sócio

-- Estas três checavam dono_id direto e não passavam por e_dono(), então o sócio ficaria
-- de fora justamente de editar e encerrar.
drop policy if exists "dono edita a obra" on public.obras;
create policy "sócio edita a obra"
  on public.obras for update to authenticated
  using (public.e_dono(id)) with check (public.e_dono(id));

drop policy if exists "dono apaga a obra" on public.obras;
create policy "sócio apaga a obra"
  on public.obras for delete to authenticated
  using (public.e_dono(id));

-- ---------------------------------------------------------------- convite junta os grupos

create or replace function public.aceitar_convite(p_codigo text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_convite public.convites;
  v_meu_grupo uuid;
  v_grupo_do_dono uuid;
begin
  select * into v_convite from public.convites where codigo = upper(trim(p_codigo));

  if not found then
    raise exception 'convite não encontrado';
  end if;
  if v_convite.expira_em < now() then
    raise exception 'convite expirado';
  end if;
  if v_convite.aceito_por is not null and v_convite.aceito_por <> auth.uid() then
    raise exception 'convite já usado';
  end if;

  select grupo_id into v_meu_grupo from public.profiles where id = auth.uid();
  select p.grupo_id into v_grupo_do_dono
  from public.profiles p
  join public.obras o on o.dono_id = p.id
  where o.id = v_convite.obra_id;

  -- Junta os dois grupos num só. Vai todo mundo que já estava comigo, senão quem entrou
  -- antes perderia de vista as obras que enxergava — e a sociedade deixaria de ser
  -- "todos veem tudo".
  if v_grupo_do_dono is not null and v_meu_grupo is distinct from v_grupo_do_dono then
    update public.profiles set grupo_id = v_grupo_do_dono where grupo_id = v_meu_grupo;
  end if;

  -- Continua registrando a passagem pela obra do convite: é o que a tela "quem está na
  -- obra" mostra, e o que preserva o acesso se um dia a sociedade for desfeita.
  insert into public.obra_membros (obra_id, user_id, papel)
  values (v_convite.obra_id, auth.uid(), 'colaborador')
  on conflict do nothing;

  update public.convites
  set aceito_por = auth.uid(), aceito_em = now()
  where id = v_convite.id;

  return v_convite.obra_id;
end;
$$;

-- ---------------------------------------------------------------- perfis novos

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome text;
  v_iniciais text;
begin
  v_nome := coalesce(nullif(trim(new.raw_user_meta_data ->> 'nome'), ''), split_part(new.email, '@', 1));
  v_iniciais := upper(
    coalesce(substr(split_part(v_nome, ' ', 1), 1, 1), '') ||
    coalesce(nullif(substr(split_part(v_nome, ' ', 2), 1, 1), ''), substr(split_part(v_nome, ' ', 1), 2, 1))
  );

  -- Nasce sozinho no próprio grupo; um convite aceito depois é que junta com alguém.
  insert into public.profiles (id, nome, iniciais, grupo_id)
  values (new.id, v_nome, coalesce(nullif(v_iniciais, ''), '?'), new.id);

  insert into public.categorias (dono_id, criado_por, nome)
  select new.id, new.id, nome
  from unnest(array['Material', 'Mão de obra', 'Equipamento', 'Frete', 'Taxas e alvarás']) as nome;

  return new;
end;
$$;
