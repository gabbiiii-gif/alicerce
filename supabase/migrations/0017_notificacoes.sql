-- Notificações: toda mudança numa obra avisa quem mais participa dela.
--
-- Até aqui, o que um sócio fazia só chegava ao outro se ele abrisse a obra e fosse
-- procurar. Agora cada escrita que mexe nos números ou na sociedade vira um aviso para os
-- outros — nunca para quem fez:
--
--   lançamento   novo, alterado, apagado
--   aditivo      novo, alterado, removido
--   repasse      novo, apagado
--   obra         criada, alterada, encerrada, reaberta, apagada
--   categoria    criada, apagada
--   sociedade    alguém entrou, alguém saiu
--   plano        pagamento confirmado (esse vai para todo o grupo, inclusive quem pagou)
--
-- Quem gera o aviso é o BANCO, por trigger, e não o app. Assim nenhum caminho escapa: o
-- app antigo instalado no celular de alguém, uma função do servidor, uma tela que vier a
-- existir amanhã — tudo que passa pela tabela avisa. E o app não consegue forjar aviso para
-- ninguém: não existe grant de insert nesta tabela.
--
-- Aviso nunca derruba a ação que o gerou. Cada trigger engole o próprio erro e deixa um
-- warning no log: um lançamento que não salva porque o aviso falhou é muito pior do que um
-- aviso a menos.
--
-- Roda DEPOIS da 0016 (também avisa sobre repasses). Pode colar inteira no SQL Editor e
-- rodar de novo sem estragar nada.

do $$
begin
  if to_regclass('public.repasses') is null then
    raise exception 'Aplique a 0016_repasses.sql antes desta: a 0017 também avisa sobre repasses.';
  end if;
end;
$$;

-- ---------------------------------------------------------------- tabela

create table if not exists public.notificacoes (
  id uuid primary key default gen_random_uuid(),
  -- Quem recebe.
  user_id uuid not null references public.profiles on delete cascade,
  -- Quem fez. Nulo quando foi o sistema (o plano pago chega pelo webhook, sem sessão).
  autor_id uuid references public.profiles on delete set null,
  -- Obra apagada leva o vínculo, não o aviso: "Ana apagou a obra X" continua na lista.
  obra_id uuid references public.obras on delete set null,
  tipo text not null,
  -- O texto sai pronto do banco, com o nome de quem fez e os valores do momento. É o que a
  -- lista mostra e o que um push para o celular vai mandar, sem precisar remontar nada.
  titulo text not null,
  corpo text,
  -- Ids e valores para o app decidir para onde o toque leva, e as iniciais de quem fez,
  -- guardadas agora: se a sociedade for desfeita, o perfil dela deixa de ser legível.
  dados jsonb not null default '{}'::jsonb,
  lida_em timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notificacoes_caixa on public.notificacoes (user_id, created_at desc);
create index if not exists notificacoes_nao_lidas on public.notificacoes (user_id) where lida_em is null;
-- Para o "on delete set null" não varrer a tabela inteira a cada obra apagada.
create index if not exists notificacoes_obra on public.notificacoes (obra_id);

-- ---------------------------------------------------------------- acesso

alter table public.notificacoes enable row level security;

-- Mesma lição da 0010: tabela nova em public nasce com grant para anon e authenticated, e a
-- RLS sozinha não impede um insert pela API pública. Sem o revoke, qualquer um mandaria
-- "aviso" em nome de outra pessoa.
revoke all on public.notificacoes from anon, authenticated;
grant select on public.notificacoes to authenticated;
-- Marcar como lida é a única escrita do app. Grant por coluna, como em profiles (0003):
-- quem tem UPDATE na tabela inteira reescreveria o texto do aviso.
grant update (lida_em) on public.notificacoes to authenticated;

drop policy if exists "cada um vê as próprias notificações" on public.notificacoes;
create policy "cada um vê as próprias notificações"
  on public.notificacoes for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "cada um marca as próprias como lidas" on public.notificacoes;
create policy "cada um marca as próprias como lidas"
  on public.notificacoes for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------- tempo real

-- O app escuta os inserts desta tabela (Supabase Realtime) para o aviso aparecer na hora,
-- com o app aberto. O Realtime aplica a policy de select acima: cada um recebe só os seus.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime' and puballtables)
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notificacoes'
     ) then
    alter publication supabase_realtime add table public.notificacoes;
  end if;
end;
$$;

-- ---------------------------------------------------------------- helpers

-- Dinheiro como o app mostra (fmt, em lib/format.ts): real inteiro, ponto no milhar. O
-- espaço depois do R$ é o que não quebra linha (chr(160)): numa tela estreita, o "R$" não
-- fica no fim de uma linha e o número no começo da outra.
create or replace function public.reais(p_valor numeric)
returns text
language sql
stable
set search_path = public
as $$
  select 'R$' || chr(160) || replace(to_char(round(coalesce(p_valor, 0)), 'FM999,999,999,990'), ',', '.');
$$;

create or replace function public.primeiro_nome(p_user uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select nullif(split_part(trim(p.nome), ' ', 1), '') from public.profiles p where p.id = p_user),
    'Alguém'
  );
$$;

-- Quem enxerga a obra: quem foi posto nela e todo o grupo do dono. É a regra de
-- e_membro() lida do outro lado — lista as pessoas em vez de responder por uma.
create or replace function public.quem_ve_a_obra(p_obra uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.user_id from public.obra_membros m where m.obra_id = p_obra
  union
  select p.id
  from public.obras o
  join public.profiles dono on dono.id = o.dono_id
  join public.profiles p on p.grupo_id = dono.grupo_id
  where o.id = p_obra;
$$;

-- Quem usa a lista de categorias de um dono: o grupo dele e quem foi posto numa obra dele.
-- O avesso de meus_donos().
create or replace function public.quem_usa_as_categorias(p_dono uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from public.profiles dono
  join public.profiles p on p.grupo_id = dono.grupo_id
  where dono.id = p_dono
  union
  select m.user_id
  from public.obra_membros m
  join public.obras o on o.id = m.obra_id
  where o.dono_id = p_dono;
$$;

-- Grava um aviso para cada destinatário, menos para quem fez. O título começa pelo nome
-- de quem fez: p_acao é o resto da frase ("lançou uma saída de R$ 1.250").
--
-- Sem sessão não há "quem fez": é o sistema (SQL Editor, conta apagada pelo painel). Aí
-- ninguém é avisado — o aviso é sobre o que a outra pessoa fez, e ali não houve pessoa.
create or replace function public.notificar(
  p_destinos uuid[],
  p_obra uuid,
  p_tipo text,
  p_acao text,
  p_corpo text,
  p_dados jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_autor uuid := auth.uid();
  v_iniciais text;
begin
  if v_autor is null then
    return;
  end if;

  select iniciais into v_iniciais from public.profiles where id = v_autor;

  insert into public.notificacoes (user_id, autor_id, obra_id, tipo, titulo, corpo, dados)
  select distinct
    d.id,
    v_autor,
    p_obra,
    p_tipo,
    public.primeiro_nome(v_autor) || ' ' || p_acao,
    nullif(p_corpo, ''),
    coalesce(p_dados, '{}'::jsonb) || jsonb_build_object('iniciais', v_iniciais)
  from unnest(p_destinos) as d(id)
  where d.id is not null and d.id <> v_autor;
end;
$$;

-- Nenhum destes é para o app chamar. notificar() aberto deixaria qualquer um mandar aviso
-- falso para qualquer pessoa; os outros dizem quem enxerga o quê. As triggers abaixo rodam
-- como dona das funções (security definer) e não dependem destes grants.
--
-- O revoke é nominal, e não só de PUBLIC: o Supabase dá EXECUTE a anon e authenticated
-- pelo nome (a lição da 0007).
revoke all on function public.reais(numeric) from public, anon, authenticated;
revoke all on function public.primeiro_nome(uuid) from public, anon, authenticated;
revoke all on function public.quem_ve_a_obra(uuid) from public, anon, authenticated;
revoke all on function public.quem_usa_as_categorias(uuid) from public, anon, authenticated;
revoke all on function public.notificar(uuid[], uuid, text, text, text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------- lançamentos

-- Uma regra vale para as triggers das tabelas filhas: mudança em CASCATA não avisa. Apagar
-- uma obra leva junto os lançamentos, aditivos e repasses dela, e apagar uma categoria
-- zera a categoria dos lançamentos que a usavam. Quem fez a ação de cima já avisou por
-- ela; sem a regra, apagar uma obra com 80 lançamentos mandaria 81 avisos.
--
-- O sinal da cascata é o estado, não a pilha: o Postgres dispara as triggers da cascata
-- como se fossem escritas soltas (pg_trigger_depth() volta 1, conferido), mas quando elas
-- rodam a obra — ou a categoria — já não existe.
create or replace function public.notifica_lancamento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_l public.lancamentos;
  v_obra text;
  v_categoria text;
  v_oque text;
  v_corpo text;
  v_dados jsonb;
begin
  begin
    if tg_op = 'DELETE' then
      v_l := old;
    else
      v_l := new;
    end if;

    if tg_op = 'UPDATE' then
      if (new.tipo, new.descricao, new.valor, new.data, new.categoria_id)
           is not distinct from (old.tipo, old.descricao, old.valor, old.data, old.categoria_id) then
        -- Só mudou o que não aparece para ninguém (o vínculo com a nota, por exemplo).
        return null;
      end if;
      if new.categoria_id is null and old.categoria_id is not null
         and (new.tipo, new.descricao, new.valor, new.data)
               is not distinct from (old.tipo, old.descricao, old.valor, old.data)
         and not exists (select 1 from public.categorias where id = old.categoria_id) then
        -- A cascata de uma categoria apagada.
        return null;
      end if;
    end if;

    select nome into v_obra from public.obras where id = v_l.obra_id;
    if not found then
      return null;
    end if;
    select nome into v_categoria from public.categorias where id = v_l.categoria_id;

    v_oque := case v_l.tipo when 'entrada' then 'a entrada' else 'a saída' end;
    v_corpo := concat_ws(' · ', v_obra, v_l.descricao, v_categoria);
    v_dados := jsonb_build_object('lancamento_id', v_l.id, 'tipo', v_l.tipo, 'valor', v_l.valor);

    if tg_op = 'INSERT' then
      perform public.notificar(
        array(select public.quem_ve_a_obra(v_l.obra_id)), v_l.obra_id, 'lancamento_novo',
        case v_l.tipo when 'entrada' then 'registrou uma entrada de ' else 'lançou uma saída de ' end
          || public.reais(v_l.valor),
        v_corpo || case when v_l.comprovante_id is not null then ' · com nota fiscal' else '' end,
        v_dados
      );
    elsif tg_op = 'DELETE' then
      perform public.notificar(
        array(select public.quem_ve_a_obra(v_l.obra_id)), v_l.obra_id, 'lancamento_apagado',
        'apagou ' || v_oque || ' de ' || public.reais(v_l.valor),
        v_corpo,
        v_dados
      );
    else
      perform public.notificar(
        array(select public.quem_ve_a_obra(v_l.obra_id)), v_l.obra_id, 'lancamento_alterado',
        'alterou ' || v_oque || ' de ' || public.reais(new.valor),
        v_corpo || case when new.valor is distinct from old.valor
                        then ' · antes ' || public.reais(old.valor) else '' end,
        v_dados
      );
    end if;
  exception when others then
    raise warning 'Alicerce: aviso de lançamento não gerado (%)', sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists notifica_lancamento on public.lancamentos;
create trigger notifica_lancamento
  after insert or update or delete on public.lancamentos
  for each row execute function public.notifica_lancamento();

-- ---------------------------------------------------------------- aditivos

create or replace function public.notifica_aditivo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_a public.aditivos;
  v_obra text;
  v_dados jsonb;
begin
  begin
    if tg_op = 'DELETE' then
      v_a := old;
    else
      v_a := new;
    end if;

    if tg_op = 'UPDATE' and (new.descricao, new.valor) is not distinct from (old.descricao, old.valor) then
      return null;
    end if;

    select nome into v_obra from public.obras where id = v_a.obra_id;
    if not found then
      return null;
    end if;
    v_dados := jsonb_build_object('aditivo_id', v_a.id, 'valor', v_a.valor);

    if tg_op = 'INSERT' then
      perform public.notificar(
        array(select public.quem_ve_a_obra(v_a.obra_id)), v_a.obra_id, 'aditivo_novo',
        'somou um aditivo de ' || public.reais(v_a.valor),
        concat_ws(' · ', v_obra, v_a.descricao),
        v_dados
      );
    elsif tg_op = 'DELETE' then
      perform public.notificar(
        array(select public.quem_ve_a_obra(v_a.obra_id)), v_a.obra_id, 'aditivo_removido',
        'removeu um aditivo de ' || public.reais(v_a.valor),
        concat_ws(' · ', v_obra, v_a.descricao),
        v_dados
      );
    else
      perform public.notificar(
        array(select public.quem_ve_a_obra(v_a.obra_id)), v_a.obra_id, 'aditivo_alterado',
        'alterou um aditivo para ' || public.reais(new.valor),
        concat_ws(' · ', v_obra, new.descricao)
          || case when new.valor is distinct from old.valor
                  then ' · antes ' || public.reais(old.valor) else '' end,
        v_dados
      );
    end if;
  exception when others then
    raise warning 'Alicerce: aviso de aditivo não gerado (%)', sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists notifica_aditivo on public.aditivos;
create trigger notifica_aditivo
  after insert or update or delete on public.aditivos
  for each row execute function public.notifica_aditivo();

-- ---------------------------------------------------------------- repasses

-- Um aviso por pessoa, e não um para todos: quem recebe lê "Ana → você", não o próprio
-- nome, igual à lista de repasses do app.
create or replace function public.notifica_repasse()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_r public.repasses;
  v_obra text;
  v_destino uuid;
begin
  begin
    if tg_op = 'DELETE' then
      v_r := old;
    else
      v_r := new;
    end if;

    select nome into v_obra from public.obras where id = v_r.obra_id;
    if not found then
      return null;
    end if;

    for v_destino in select public.quem_ve_a_obra(v_r.obra_id) loop
      perform public.notificar(
        array[v_destino], v_r.obra_id,
        case when tg_op = 'DELETE' then 'repasse_apagado' else 'repasse_novo' end,
        case when tg_op = 'DELETE' then 'apagou um repasse de ' else 'registrou um repasse de ' end
          || public.reais(v_r.valor),
        concat_ws(' · ',
          v_obra,
          case when v_r.de_id = v_destino then 'você' else public.primeiro_nome(v_r.de_id) end
            || ' → '
            || case when v_r.para_id = v_destino then 'você' else public.primeiro_nome(v_r.para_id) end,
          v_r.descricao
        ),
        jsonb_build_object('repasse_id', v_r.id, 'valor', v_r.valor)
      );
    end loop;
  exception when others then
    raise warning 'Alicerce: aviso de repasse não gerado (%)', sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists notifica_repasse on public.repasses;
create trigger notifica_repasse
  after insert or delete on public.repasses
  for each row execute function public.notifica_repasse();

-- ---------------------------------------------------------------- obras

create or replace function public.notifica_obra()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quem uuid[];
  v_mudou text;
begin
  begin
    v_quem := array(select public.quem_ve_a_obra(new.id));

    if tg_op = 'INSERT' then
      perform public.notificar(
        v_quem, new.id, 'obra_nova',
        'criou a obra ' || new.nome,
        'Valor fechado ' || public.reais(new.valor_fechado),
        '{}'::jsonb
      );
      return null;
    end if;

    if new.status is distinct from old.status then
      perform public.notificar(
        v_quem, new.id,
        case when new.status = 'encerrada' then 'obra_encerrada' else 'obra_reaberta' end,
        case when new.status = 'encerrada' then 'encerrou a obra ' else 'reabriu a obra ' end || new.nome,
        null,
        '{}'::jsonb
      );
    end if;

    -- O resto numa frase só: trocar nome e valor de uma vez é uma alteração, não duas.
    v_mudou := concat_ws(' · ',
      case when new.nome is distinct from old.nome
           then 'nome: ' || old.nome || ' → ' || new.nome end,
      case when new.valor_fechado is distinct from old.valor_fechado
           then 'valor fechado: ' || public.reais(old.valor_fechado) || ' → ' || public.reais(new.valor_fechado) end,
      case when new.endereco is distinct from old.endereco
           then 'endereço: ' || coalesce(new.endereco, 'apagado') end
    );
    if v_mudou <> '' then
      perform public.notificar(v_quem, new.id, 'obra_alterada', 'alterou a obra ' || new.nome, v_mudou, '{}'::jsonb);
    end if;
  exception when others then
    raise warning 'Alicerce: aviso de obra não gerado (%)', sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists notifica_obra on public.obras;
create trigger notifica_obra
  after insert or update on public.obras
  for each row execute function public.notifica_obra();

-- Apagar avisa ANTES de apagar: depois, a cascata já levou os membros e não daria mais
-- para saber quem enxergava a obra. Se o delete falhar, a transação desfaz o aviso junto.
create or replace function public.notifica_obra_apagada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_qtd int;
begin
  begin
    select count(*) into v_qtd from public.lancamentos where obra_id = old.id;
    perform public.notificar(
      array(select public.quem_ve_a_obra(old.id)), old.id, 'obra_apagada',
      'apagou a obra ' || old.nome,
      case v_qtd
        when 0 then 'Não tinha lançamentos'
        when 1 then 'Junto com 1 lançamento'
        else 'Junto com ' || v_qtd || ' lançamentos'
      end,
      '{}'::jsonb
    );
  exception when others then
    raise warning 'Alicerce: aviso de obra apagada não gerado (%)', sqlerrm;
  end;
  -- BEFORE DELETE que devolve nulo cancela o delete. Tem que ser OLD, com aviso ou sem.
  return old;
end;
$$;

drop trigger if exists notifica_obra_apagada on public.obras;
create trigger notifica_obra_apagada
  before delete on public.obras
  for each row execute function public.notifica_obra_apagada();

-- ---------------------------------------------------------------- categorias

create or replace function public.notifica_categoria()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c public.categorias;
begin
  begin
    if tg_op = 'DELETE' then
      v_c := old;
    else
      v_c := new;
    end if;

    perform public.notificar(
      array(select public.quem_usa_as_categorias(v_c.dono_id)), null,
      case when tg_op = 'DELETE' then 'categoria_apagada' else 'categoria_nova' end,
      case when tg_op = 'DELETE' then 'apagou a categoria ' else 'criou a categoria ' end || v_c.nome,
      'Vale para todas as obras',
      jsonb_build_object('categoria_id', v_c.id)
    );
  exception when others then
    raise warning 'Alicerce: aviso de categoria não gerado (%)', sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists notifica_categoria on public.categorias;
create trigger notifica_categoria
  after insert or delete on public.categorias
  for each row execute function public.notifica_categoria();

-- ---------------------------------------------------------------- sociedade

-- O grupo muda em dois lugares: aceitar_convite() (entra no grupo de quem convidou) e
-- sair_da_sociedade() (vai para um grupo novo em folha). A regra serve aos dois: quem já
-- estava no grupo de destino fica sabendo que alguém entrou, e quem ficou no grupo de
-- origem fica sabendo que alguém saiu. Num grupo vazio, nenhum dos dois avisa ninguém.
create or replace function public.notifica_sociedade()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    -- Só quem mudou a si mesmo. aceitar_convite() leva junto o grupo inteiro de quem
    -- entra; o aviso é sobre a pessoa que aceitou, não sobre cada um que veio com ela.
    if new.id is distinct from auth.uid() then
      return null;
    end if;

    perform public.notificar(
      array(select p.id from public.profiles p where p.grupo_id = new.grupo_id and p.id <> new.id),
      null, 'socio_entrou',
      'entrou na sociedade',
      'Agora vocês veem e lançam nas obras um do outro',
      jsonb_build_object('socio_id', new.id)
    );

    perform public.notificar(
      array(select p.id from public.profiles p where p.grupo_id = old.grupo_id and p.id <> new.id),
      null, 'socio_saiu',
      'desfez a sociedade',
      'Vocês não veem mais as obras um do outro. O que cada um lançou continua no histórico',
      jsonb_build_object('socio_id', new.id)
    );
  exception when others then
    raise warning 'Alicerce: aviso de sociedade não gerado (%)', sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists notifica_sociedade on public.profiles;
create trigger notifica_sociedade
  after update of grupo_id on public.profiles
  for each row
  when (old.grupo_id is distinct from new.grupo_id)
  execute function public.notifica_sociedade();

-- ---------------------------------------------------------------- plano

-- Quem paga o Pix vê a confirmação na tela; o sócio, que também usa o plano, não via nada.
-- Agora o grupo inteiro fica sabendo. Não tem "quem fez": o crédito chega pelo webhook do
-- Mercado Pago, sem sessão, então o insert é direto e não passa por notificar().
--
-- Esta trigger roda dentro de creditar_pix(). O bloco de exceção é o que garante que um
-- defeito aqui nunca impede o crédito de um pagamento.
create or replace function public.notifica_plano()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    if new.status in ('pix', 'cortesia')
       and new.vale_ate > now()
       and (tg_op = 'INSERT' or new.vale_ate > coalesce(old.vale_ate, '-infinity'::timestamptz)) then
      insert into public.notificacoes (user_id, autor_id, obra_id, tipo, titulo, corpo, dados)
      select
        p.id, null, null, 'plano_renovado',
        case when new.status = 'cortesia' then 'Plano liberado' else 'Pagamento do plano confirmado' end,
        'Vale até ' || to_char(new.vale_ate at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'),
        jsonb_build_object('vale_ate', new.vale_ate)
      from public.profiles p
      where p.grupo_id = new.grupo_id;
    end if;
  exception when others then
    raise warning 'Alicerce: aviso de plano não gerado (%)', sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists notifica_plano on public.assinaturas;
create trigger notifica_plano
  after insert or update of status, vale_ate on public.assinaturas
  for each row execute function public.notifica_plano();
