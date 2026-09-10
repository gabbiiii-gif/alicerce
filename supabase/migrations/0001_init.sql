-- Alicerce — schema inicial
-- Regra de negócio central: o histórico da obra é compartilhado entre os membros
-- (cada lançamento mostra quem enviou), mas editar/apagar só quem lançou.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- perfis

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  nome text not null,
  iniciais text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- obras

create table public.obras (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  endereco text,
  valor_fechado numeric(14,2) not null check (valor_fechado > 0),
  previsto_mensal numeric(14,2) not null default 0,
  status text not null default 'ativa' check (status in ('ativa', 'encerrada')),
  dono_id uuid not null references public.profiles(id) on delete cascade,
  encerrada_em timestamptz,
  created_at timestamptz not null default now()
);

create table public.obra_membros (
  obra_id uuid not null references public.obras on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  papel text not null default 'colaborador' check (papel in ('dono', 'colaborador')),
  created_at timestamptz not null default now(),
  primary key (obra_id, user_id)
);

create index on public.obra_membros (user_id);
create index on public.obras (dono_id);

-- ---------------------------------------------------------------- categorias
-- Lista única por dono: valem para todas as obras dele e os membros usam a mesma.

create table public.categorias (
  id uuid primary key default gen_random_uuid(),
  dono_id uuid not null references public.profiles on delete cascade,
  criado_por uuid not null references public.profiles on delete cascade,
  nome text not null,
  created_at timestamptz not null default now(),
  unique (dono_id, nome)
);

-- ---------------------------------------------------------------- aditivos

create table public.aditivos (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references public.obras on delete cascade,
  autor_id uuid not null references public.profiles on delete cascade,
  descricao text not null,
  valor numeric(14,2) not null check (valor > 0),
  created_at timestamptz not null default now()
);

create index on public.aditivos (obra_id);

-- ---------------------------------------------------------------- comprovantes
-- Fila do agente: o arquivo entra aqui, a IA lê e o usuário confere antes de virar lançamento.

create table public.comprovantes (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references public.obras on delete cascade,
  autor_id uuid not null references public.profiles on delete cascade,
  storage_path text not null,
  mime text,
  origem text not null default 'arquivo' check (origem in ('foto', 'arquivo')),
  status text not null default 'lendo' check (status in ('lendo', 'pronto', 'erro', 'confirmado')),
  extraido jsonb,
  erro text,
  created_at timestamptz not null default now()
);

create index on public.comprovantes (autor_id, status);
create index on public.comprovantes (obra_id);

-- ---------------------------------------------------------------- lançamentos

create table public.lancamentos (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references public.obras on delete cascade,
  autor_id uuid not null references public.profiles on delete cascade,
  tipo text not null check (tipo in ('entrada', 'saida')),
  descricao text not null,
  categoria_id uuid references public.categorias on delete set null,
  valor numeric(14,2) not null check (valor > 0),
  data date not null default current_date,
  comprovante_id uuid references public.comprovantes on delete set null,
  created_at timestamptz not null default now()
);

create index on public.lancamentos (obra_id, data desc);
create index on public.lancamentos (autor_id);

-- ---------------------------------------------------------------- convites

create table public.convites (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references public.obras on delete cascade,
  codigo text not null unique,
  criado_por uuid not null references public.profiles on delete cascade,
  expira_em timestamptz not null default now() + interval '7 days',
  aceito_por uuid references public.profiles on delete set null,
  aceito_em timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- helpers
-- SECURITY DEFINER para as policies não recursionarem entre obras e obra_membros.

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
  );
$$;

create or replace function public.e_dono(p_obra uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.obras o
    where o.id = p_obra and o.dono_id = auth.uid()
  );
$$;

-- Donos cujas obras eu participo (inclui eu mesmo): define de quem é a lista de categorias que enxergo.
create or replace function public.meus_donos()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select auth.uid()
  union
  select o.dono_id
  from public.obras o
  join public.obra_membros m on m.obra_id = o.id
  where m.user_id = auth.uid();
$$;

-- Pessoas que dividem alguma obra comigo: preciso ver o nome delas no histórico e no relatório.
create or replace function public.compartilha_obra(p_user uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.obra_membros meu
    join public.obra_membros dele on dele.obra_id = meu.obra_id
    where meu.user_id = auth.uid() and dele.user_id = p_user
  );
$$;

-- ---------------------------------------------------------------- triggers

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

  insert into public.profiles (id, nome, iniciais)
  values (new.id, v_nome, coalesce(nullif(v_iniciais, ''), '?'));

  insert into public.categorias (dono_id, criado_por, nome)
  select new.id, new.id, nome
  from unnest(array['Material', 'Mão de obra', 'Equipamento', 'Frete', 'Taxas e alvarás']) as nome;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_nova_obra()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.obra_membros (obra_id, user_id, papel)
  values (new.id, new.dono_id, 'dono')
  on conflict do nothing;
  return new;
end;
$$;

create trigger on_obra_created
  after insert on public.obras
  for each row execute function public.handle_nova_obra();

-- ---------------------------------------------------------------- convite

create or replace function public.aceitar_convite(p_codigo text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_convite public.convites;
begin
  select * into v_convite from public.convites where codigo = upper(trim(p_codigo));

  if v_convite is null then
    raise exception 'convite não encontrado';
  end if;
  if v_convite.expira_em < now() then
    raise exception 'convite expirado';
  end if;
  if v_convite.aceito_por is not null and v_convite.aceito_por <> auth.uid() then
    raise exception 'convite já usado';
  end if;

  insert into public.obra_membros (obra_id, user_id, papel)
  values (v_convite.obra_id, auth.uid(), 'colaborador')
  on conflict do nothing;

  update public.convites
  set aceito_por = auth.uid(), aceito_em = now()
  where id = v_convite.id;

  return v_convite.obra_id;
end;
$$;

-- ---------------------------------------------------------------- RLS

alter table public.profiles enable row level security;
alter table public.obras enable row level security;
alter table public.obra_membros enable row level security;
alter table public.categorias enable row level security;
alter table public.aditivos enable row level security;
alter table public.comprovantes enable row level security;
alter table public.lancamentos enable row level security;
alter table public.convites enable row level security;

-- perfis
create policy "perfil visível para quem divide obra"
  on public.profiles for select to authenticated
  using (id = auth.uid() or public.compartilha_obra(id));

create policy "edita o próprio perfil"
  on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- obras
create policy "membro vê a obra"
  on public.obras for select to authenticated
  using (public.e_membro(id));

create policy "cria obra própria"
  on public.obras for insert to authenticated
  with check (dono_id = auth.uid());

create policy "dono edita a obra"
  on public.obras for update to authenticated
  using (dono_id = auth.uid()) with check (dono_id = auth.uid());

create policy "dono apaga a obra"
  on public.obras for delete to authenticated
  using (dono_id = auth.uid());

-- membros
create policy "membro vê a equipe"
  on public.obra_membros for select to authenticated
  using (public.e_membro(obra_id));

create policy "dono adiciona membro"
  on public.obra_membros for insert to authenticated
  with check (public.e_dono(obra_id));

create policy "dono remove membro ou membro sai"
  on public.obra_membros for delete to authenticated
  using (public.e_dono(obra_id) or user_id = auth.uid());

-- categorias
create policy "vê a lista de categorias das obras que participo"
  on public.categorias for select to authenticated
  using (dono_id in (select public.meus_donos()));

create policy "membro cria categoria na lista compartilhada"
  on public.categorias for insert to authenticated
  with check (criado_por = auth.uid() and dono_id in (select public.meus_donos()));

create policy "apaga categoria que criou"
  on public.categorias for delete to authenticated
  using (criado_por = auth.uid());

-- aditivos
create policy "membro vê aditivos"
  on public.aditivos for select to authenticated
  using (public.e_membro(obra_id));

create policy "membro lança aditivo"
  on public.aditivos for insert to authenticated
  with check (autor_id = auth.uid() and public.e_membro(obra_id));

create policy "só o autor edita o aditivo"
  on public.aditivos for update to authenticated
  using (autor_id = auth.uid()) with check (autor_id = auth.uid());

create policy "só o autor apaga o aditivo"
  on public.aditivos for delete to authenticated
  using (autor_id = auth.uid());

-- comprovantes (fila pessoal, antes de virar lançamento)
create policy "vê a própria fila"
  on public.comprovantes for select to authenticated
  using (autor_id = auth.uid());

create policy "manda comprovante para obra que participo"
  on public.comprovantes for insert to authenticated
  with check (autor_id = auth.uid() and public.e_membro(obra_id));

create policy "mexe na própria fila"
  on public.comprovantes for update to authenticated
  using (autor_id = auth.uid()) with check (autor_id = auth.uid());

create policy "descarta da própria fila"
  on public.comprovantes for delete to authenticated
  using (autor_id = auth.uid());

-- lançamentos: histórico compartilhado, edição só do autor
create policy "membro vê todo o histórico da obra"
  on public.lancamentos for select to authenticated
  using (public.e_membro(obra_id));

create policy "membro lança na obra"
  on public.lancamentos for insert to authenticated
  with check (autor_id = auth.uid() and public.e_membro(obra_id));

create policy "só o autor edita o lançamento"
  on public.lancamentos for update to authenticated
  using (autor_id = auth.uid()) with check (autor_id = auth.uid());

create policy "só o autor apaga o lançamento"
  on public.lancamentos for delete to authenticated
  using (autor_id = auth.uid());

-- convites
create policy "membro vê convites da obra"
  on public.convites for select to authenticated
  using (public.e_membro(obra_id));

create policy "dono cria convite"
  on public.convites for insert to authenticated
  with check (criado_por = auth.uid() and public.e_dono(obra_id));

create policy "dono apaga convite"
  on public.convites for delete to authenticated
  using (public.e_dono(obra_id));

-- ---------------------------------------------------------------- storage

insert into storage.buckets (id, name, public)
values ('comprovantes', 'comprovantes', false)
on conflict (id) do nothing;

-- Caminho do arquivo: {obra_id}/{user_id}/{arquivo}
create policy "membro envia comprovante da obra"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'comprovantes'
    and public.e_membro(((storage.foldername(name))[1])::uuid)
    and ((storage.foldername(name))[2])::uuid = auth.uid()
  );

create policy "membro vê comprovantes da obra"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'comprovantes'
    and public.e_membro(((storage.foldername(name))[1])::uuid)
  );

create policy "autor apaga o próprio comprovante"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'comprovantes'
    and ((storage.foldername(name))[2])::uuid = auth.uid()
  );
