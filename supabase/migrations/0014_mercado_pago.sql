-- Pix pelo Mercado Pago: a pessoa gera o QR no app, paga no banco, e o plano estende sozinho.
--
-- Quem grava aqui são só as funções `pix` e `mercadopago-webhook`, com a service role.
-- O app nunca escreve nem lê esta tabela direto — tudo passa pela função, que decide pela
-- sessão de quem chamou.

-- Quem pagou em 22/09 (0013) vence no fim do dia 22/10. Se a 0013 já tinha rodado com o
-- prazo antigo (now() + 30 dias), isto acerta a data para o dia 22. Nunca encurta ninguém.
update public.assinaturas
set vale_ate = timestamptz '2026-10-22 23:59:59-03', atualizado_em = now()
where status = 'pix' and vale_ate < timestamptz '2026-10-22 23:59:59-03';

create table public.pagamentos (
  id uuid primary key default gen_random_uuid(),

  -- Quem gerou o Pix. O crédito vai para o grupo em que essa pessoa estiver na hora do
  -- pagamento, não na hora de gerar — sair_da_sociedade() troca o grupo_id no meio.
  titular_id uuid not null,

  -- Id do pagamento no Mercado Pago. Texto porque é número grande e a gente só compara.
  mp_payment_id text unique,

  -- Espelho do status do Mercado Pago (pending, approved, cancelled, rejected, refunded…),
  -- mais o nosso 'criando', para a linha que existe antes da resposta deles.
  status text not null default 'criando',

  valor numeric(10, 2) not null,
  qr_code text,
  qr_code_base64 text,
  expira_em timestamptz,

  -- Preenchido uma vez só, junto com o crédito. É a trava contra creditar duas vezes.
  pago_em timestamptz,
  vale_ate_concedido timestamptz,

  criado_em timestamptz not null default now()
);

create index pagamentos_titular on public.pagamentos (titular_id, criado_em desc);

alter table public.pagamentos enable row level security;
-- Sem policy e sem grant: nem leitura pelo app. Mesma lição da 0010 — sem o revoke, a
-- tabela nasce gravável pela anon key.
revoke all on public.pagamentos from anon, authenticated;

-- ---------------------------------------------------------------- crédito
-- Chamado quando o Mercado Pago confirma o pagamento — pelo webhook OU pela tela que fica
-- conferindo. Os dois podem chegar juntos, então a trava é o próprio update: só a primeira
-- chamada acha a linha com pago_em vazio. A segunda não credita nada.
--
-- O mês novo começa no fim do prazo atual quando ele ainda vale: quem paga no dia 20 não
-- perde os dois dias, e o vencimento continua no dia 22. Vencido, conta um mês a partir do
-- pagamento.
create or replace function public.creditar_pix(p_mp_payment_id text, p_valor numeric)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pag public.pagamentos;
  v_grupo uuid;
  v_vale timestamptz;
begin
  update public.pagamentos
  set status = 'approved', pago_em = now()
  where mp_payment_id = p_mp_payment_id
    and pago_em is null
    and p_valor >= valor
  returning * into v_pag;

  if not found then
    return null;
  end if;

  select grupo_id into v_grupo from public.profiles where id = v_pag.titular_id;
  if v_grupo is null then
    raise exception 'quem pagou não tem perfil';
  end if;

  insert into public.assinaturas as a (grupo_id, status, vale_ate, titular_id)
  values (v_grupo, 'pix', now() + interval '1 month', v_pag.titular_id)
  on conflict (grupo_id) do update
  set status = 'pix',
      vale_ate = greatest(a.vale_ate, now()) + interval '1 month',
      titular_id = coalesce(a.titular_id, excluded.titular_id),
      atualizado_em = now()
  returning a.vale_ate into v_vale;

  update public.pagamentos set vale_ate_concedido = v_vale where id = v_pag.id;
  return v_vale;
end;
$$;

-- Só o servidor credita. Aberta para authenticated, bastaria chamar pela API com o id de
-- um pagamento qualquer para ganhar um mês.
revoke all on function public.creditar_pix(text, numeric) from public, anon, authenticated;
grant execute on function public.creditar_pix(text, numeric) to service_role;
