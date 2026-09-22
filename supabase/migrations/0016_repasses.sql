-- Repasse: dinheiro que um sócio passa para o outro dentro de uma obra.
--
-- Não é entrada nem saída da obra — o dinheiro é o mesmo, só muda de mão. Por isso vive
-- numa tabela própria, fora de lancamentos: nada aqui mexe em recebido, saídas ou em aberto.
-- Serve para o relatório dizer quanto foi repassado e com quem o dinheiro está.

create table public.repasses (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references public.obras on delete cascade,
  autor_id uuid not null references public.profiles on delete cascade,
  de_id uuid not null references public.profiles on delete cascade,
  para_id uuid not null references public.profiles on delete cascade,
  valor numeric(14,2) not null check (valor > 0),
  data date not null default current_date,
  descricao text,
  created_at timestamptz not null default now(),
  check (de_id <> para_id)
);

create index repasses_obra on public.repasses (obra_id, data desc);

alter table public.repasses enable row level security;

create policy "membro vê repasses da obra"
  on public.repasses for select to authenticated
  using (public.e_membro(obra_id));

-- Quem registra tem que ser uma das pontas: dá para anotar "enviei" ou "recebi", mas não
-- um repasse entre duas outras pessoas.
create policy "membro registra repasse em que participa"
  on public.repasses for insert to authenticated
  with check (
    autor_id = auth.uid()
    and auth.uid() in (de_id, para_id)
    and public.e_membro(obra_id)
    and public.plano_ativo()
  );

create policy "só o autor apaga o repasse"
  on public.repasses for delete to authenticated
  using (autor_id = auth.uid());
