-- Pagamento por Pix no lugar do Stripe.
--
-- Não existe mais checkout nem webhook: a pessoa paga o Pix, a gente confere o extrato e
-- libera o grupo na mão (SQL no fim de PRODUCAO.md). O status novo é 'pix' — acesso pago,
-- com prazo, que ninguém renova sozinho. Quando vence, o grupo volta a modo leitura até o
-- próximo Pix ser confirmado.
--
-- As colunas stripe_* ficam na tabela, paradas. Apagar não ganha nada e perde o histórico
-- de quem assinou pelo cartão.

-- ---------------------------------------------------------------- quem já pagou
-- PRIMEIRO, pelo mesmo motivo da 0012: se o arquivo não rodar numa transação só, a troca
-- da regra abaixo deixaria uma janela em que ninguém tem plano.
--
-- Todos os grupos existentes já pagaram por Pix. Todo mundo vira 'pix', e quem já tinha
-- prazo maior fica com o maior — ninguém perde dias nesta troca.
--
-- ⚠️  ESCOLHA AQUI: até quando vale o que eles já pagaram.
insert into public.assinaturas (grupo_id, status, vale_ate)
select distinct p.grupo_id, 'pix', now() + interval '30 days'
from public.profiles p
on conflict (grupo_id) do update
set status = 'pix',
    vale_ate = greatest(public.assinaturas.vale_ate, excluded.vale_ate),
    atualizado_em = now();

-- Titular: quem abriu o grupo, mesmo critério da 0011. É ele quem vê o preço e a chave Pix;
-- o convidado segue sem nada a pagar.
update public.assinaturas a
set titular_id = p.id
from public.profiles p
where p.grupo_id = a.grupo_id
  and p.id = p.grupo_id
  and a.titular_id is null;

-- ---------------------------------------------------------------- o que conta como plano
-- Os status do Stripe saem: sem webhook, ninguém mais os escreve.
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
      and a.status in ('pix', 'cortesia')
      and a.vale_ate > now()
  );
$$;

-- ---------------------------------------------------------------- convite
-- Igual à 0012, só com a lista de status nova.
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

  if v_grupo_do_dono is not null and not exists (
    select 1 from public.assinaturas a
    where a.grupo_id = v_grupo_do_dono
      and a.status in ('pix', 'cortesia')
      and a.vale_ate > now()
  ) then
    raise exception 'quem convidou está sem plano ativo';
  end if;

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
