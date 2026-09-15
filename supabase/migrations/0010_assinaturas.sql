-- Assinatura: quem paga é o GRUPO, não a pessoa.
--
-- O grupo já existe desde 0003_socios e é exatamente a unidade que queremos cobrar:
-- o titular mais quem entrou por convite. Pendurar o plano no grupo faz o "convidado
-- está dentro do plano de quem pagou" cair de graça — ele não tem assinatura própria,
-- tem o grupo de quem tem.
--
-- Esta migration é só a base: cria a tabela, fecha o acesso a ela e define o helper que
-- responde "este usuário tem plano?". NENHUMA policy passa a exigir plano aqui — o app
-- continua funcionando exatamente como hoje para todo mundo. O gate entra depois, numa
-- migration própria, quando o fluxo de pagamento já estiver testado.

create table public.assinaturas (
  grupo_id uuid primary key,

  -- Identificadores do lado do Stripe. Guardados para o webhook achar o grupo quando
  -- o evento chega falando de assinatura, e para abrir o portal do cliente sem
  -- precisar criar outro Customer para a mesma pessoa.
  stripe_customer_id text unique,
  stripe_subscription_id text unique,

  -- Espelho do status do Stripe, sem check constraint de propósito: a lista de status
  -- é deles e muda com o tempo. Uma constraint apertada aqui faria o webhook estourar
  -- ao receber um status novo — e webhook que falha é cobrança que passou sem liberar
  -- o acesso. Melhor aceitar o texto e decidir em plano_ativo() o que conta como ativo.
  --   'sem_assinatura' é o nosso, os outros vêm do Stripe:
  --   trialing, active, past_due, canceled, unpaid, incomplete, incomplete_expired
  status text not null default 'sem_assinatura',

  -- Até quando o acesso vale. Sai do current_period_end do Stripe mais uma folga, para
  -- o app não travar no intervalo entre a renovação e o webhook chegar.
  vale_ate timestamptz,

  atualizado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------- acesso

alter table public.assinaturas enable row level security;

-- SEGURANÇA — RLS sozinha não basta.
--
-- No Supabase, toda tabela nova em public já nasce com grant para anon e authenticated.
-- RLS filtra LINHAS, mas é o grant que decide se a pessoa pode escrever na tabela: sem
-- revoke, bastaria um insert pela API pública com o próprio grupo_id e status 'active'
-- para assinar de graça. A lição é a mesma do grupo_id em 0003 — e conferir isso é
-- CHAMAR DE FORA com a anon key, não reler este arquivo.
revoke all on public.assinaturas from anon, authenticated;

-- Leitura só das colunas que a tela do plano precisa mostrar. Os ids do Stripe ficam
-- de fora: o app nunca precisa deles, e o que não é entregue não vaza.
grant select (grupo_id, status, vale_ate) on public.assinaturas to authenticated;

create policy "vê a assinatura do próprio grupo"
  on public.assinaturas for select to authenticated
  using (
    grupo_id = (select p.grupo_id from public.profiles p where p.id = auth.uid())
  );

-- Escrita: nenhuma policy, de propósito. Quem grava aqui é só o webhook do Stripe,
-- rodando com a service role, que passa por cima de RLS. Não existe caminho pelo app.

-- ---------------------------------------------------------------- helper

-- "Esta pessoa tem plano agora?" — usada pelas policies de insert quando o gate entrar,
-- e pela tela do plano.
--
-- past_due conta como ativo de propósito: é o estado em que o Stripe ainda está tentando
-- de novo depois de um cartão recusado. Cortar o acesso na primeira recusa transforma um
-- problema de cartão em cancelamento. Quem decide o fim é vale_ate.
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
      and a.status in ('trialing', 'active', 'past_due')
      and a.vale_ate > now()
  );
$$;

-- Fechada para quem não tem sessão, como as demais funções desde 0006/0007.
revoke all on function public.plano_ativo() from public, anon;
grant execute on function public.plano_ativo() to authenticated;
