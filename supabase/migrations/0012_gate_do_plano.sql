-- O GATE: sem plano, o app vira modo leitura.
--
-- ⚠️  Esta é a migration que corta o acesso de quem já usa o app. Antes de rodar, decida
--     a linha marcada com ESCOLHA AQUI, lá embaixo — é quantos dias de cortesia todo
--     grupo existente ganha. Sem isso, todo mundo que usa o Alicerce hoje abre o app
--     amanhã e não consegue lançar nada, sem aviso.
--
-- O que muda: as policies de INSERT passam a exigir plano_ativo(). As de SELECT não
-- mudam — quem vence continua vendo as obras e o histórico, só não cria mais nada.
-- Perder o acesso aos próprios registros de obra por um cartão recusado gera
-- cancelamento e contestação; ver o que se está perdendo gera pagamento.
--
-- DELETE também fica livre: os dados são da pessoa, e prender dados de quem parou de
-- pagar é o tipo de coisa que rende reclamação no lugar errado.

-- ---------------------------------------------------------------- cortesia

-- 'cortesia' é status nosso, não do Stripe: o grupo tem acesso sem nunca ter pago.
-- Serve para quem já usava o app antes do gate, e para liberar alguém na mão.
create or replace function public.plano_ativo()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.assinaturas a
    join public.profiles p on p.grupo_id = a.grupo_id
    where p.id = auth.uid()
      and a.status in ('trialing', 'active', 'past_due', 'cortesia')
      and a.vale_ate > now()
  );
$$;

-- ---------------------------------------------------------------- convite

-- Duas regras novas: quem convida precisa ter plano, e o grupo para em duas pessoas.
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
  v_gente int;
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

  -- Sem isto, o plano seria opcional: criar conta, convidar um amigo, e os dois usam de
  -- graça para sempre.
  if v_grupo_do_dono is not null and not exists (
    select 1 from public.assinaturas a
    where a.grupo_id = v_grupo_do_dono
      and a.status in ('trialing', 'active', 'past_due', 'cortesia')
      and a.vale_ate > now()
  ) then
    raise exception 'quem convidou está sem plano ativo';
  end if;

  -- O plano cobre o titular e mais uma pessoa.
  --
  -- A conta é dos DOIS lados, e esse é o detalhe que passa batido: aceitar_convite não
  -- junta uma pessoa, junta dois GRUPOS inteiros (o update logo abaixo). Se quem entra
  -- já tiver alguém junto, o grupo resultante teria três, e o limite valeria no papel.
  if v_grupo_do_dono is not null and v_meu_grupo is distinct from v_grupo_do_dono then
    select count(*) into v_gente
    from public.profiles p
    where p.grupo_id in (v_meu_grupo, v_grupo_do_dono);

    if v_gente > 2 then
      raise exception 'o plano cobre você e mais uma pessoa';
    end if;
  end if;

  if v_grupo_do_dono is not null and v_meu_grupo is distinct from v_grupo_do_dono then
    update public.profiles set grupo_id = v_grupo_do_dono where grupo_id = v_meu_grupo;
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

-- ---------------------------------------------------------------- o gate

drop policy if exists "cria obra própria" on public.obras;
create policy "cria obra própria"
  on public.obras for insert to authenticated
  with check (dono_id = auth.uid() and public.plano_ativo());

drop policy if exists "membro lança na obra" on public.lancamentos;
create policy "membro lança na obra"
  on public.lancamentos for insert to authenticated
  with check (autor_id = auth.uid() and public.e_membro(obra_id) and public.plano_ativo());

drop policy if exists "manda comprovante para obra que participo" on public.comprovantes;
create policy "manda comprovante para obra que participo"
  on public.comprovantes for insert to authenticated
  with check (autor_id = auth.uid() and public.e_membro(obra_id) and public.plano_ativo());

drop policy if exists "membro lança aditivo" on public.aditivos;
create policy "membro lança aditivo"
  on public.aditivos for insert to authenticated
  with check (autor_id = auth.uid() and public.e_membro(obra_id) and public.plano_ativo());

drop policy if exists "dono cria convite" on public.convites;
create policy "dono cria convite"
  on public.convites for insert to authenticated
  with check (criado_por = auth.uid() and public.e_dono(obra_id) and public.plano_ativo());

drop policy if exists "membro cria categoria na lista compartilhada" on public.categorias;
create policy "membro cria categoria na lista compartilhada"
  on public.categorias for insert to authenticated
  with check (criado_por = auth.uid() and dono_id in (select public.meus_donos()) and public.plano_ativo());

-- O storage tem porta própria: sem isto, dava para subir o arquivo do comprovante mesmo
-- sem poder criar a linha dele.
drop policy if exists "membro envia comprovante da obra" on storage.objects;
create policy "membro envia comprovante da obra"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'comprovantes'
    and public.e_membro(((storage.foldername(name))[1])::uuid)
    and ((storage.foldername(name))[2])::uuid = auth.uid()
    and public.plano_ativo()
  );

-- ---------------------------------------------------------------- quem já usa o app

-- ⚠️  ESCOLHA AQUI: quantos dias de cortesia todo grupo existente ganha.
--
-- Roda ANTES de o gate valer para eles, na mesma transação desta migration. Grupos que
-- já tiverem linha em assinaturas (o seu, do teste) ficam como estão.
insert into public.assinaturas (grupo_id, status, vale_ate)
select distinct p.grupo_id, 'cortesia', now() + interval '30 days'
from public.profiles p
on conflict (grupo_id) do nothing;
