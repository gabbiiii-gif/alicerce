-- Corrige: sair da sociedade não funcionava para quem convidou.
--
-- A versão anterior devolvia a pessoa ao grupo `auth.uid()`:
--
--   update profiles set grupo_id = v_eu where id = v_eu;
--
-- Quando o convite é aceito, quem entra adota o grupo de quem convidou, e esse grupo é o
-- id de quem convidou. Então, para quem convidou, aquela linha mandava a pessoa para o
-- grupo onde ela já estava — nada mudava, e os convidados continuavam no mesmo grupo,
-- vendo tudo. Quem saía era só quem tinha entrado; quem tinha aberto a sociedade não
-- conseguia fechá-la.
--
-- Agora o grupo de saída é sempre novo, e não o próprio id. Assim a saída independe de
-- quem abriu a sociedade: ninguém fica preso a um grupo por tê-lo criado.

create or replace function public.sair_da_sociedade()
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

  -- Grupo novo em folha. Quem fica continua junto no grupo antigo: sair é sobre mim, não
  -- dissolve o grupo dos outros.
  update public.profiles set grupo_id = gen_random_uuid() where id = v_eu;

  -- O grupo dava o acesso, mas obra_membros também dá — e sobreviveria à saída. Sem
  -- limpar os dois lados, a pessoa continuaria vendo a obra por onde entrou, e o outro
  -- continuaria vendo as obras dela.
  delete from public.obra_membros m
  using public.obras o
  where m.obra_id = o.id and m.user_id = v_eu and o.dono_id <> v_eu;

  delete from public.obra_membros m
  using public.obras o
  where m.obra_id = o.id and o.dono_id = v_eu and m.user_id <> v_eu;

  -- Convite meu ainda não aceito vira porta destrancada para uma sociedade que acabou.
  delete from public.convites c
  using public.obras o
  where c.obra_id = o.id and o.dono_id = v_eu and c.aceito_por is null;
end;
$$;

-- Sem conserto automático de propósito.
--
-- A tentação era varrer o banco atrás de quem "saiu pela metade" — grupo antigo, mas sem
-- nenhuma obra em comum — e dar um grupo novo. O critério erra: numa sociedade legítima
-- em que a obra do convite foi apagada, as duas pessoas também ficam sem obra em comum, e
-- a varredura separaria quem não pediu para ser separado.
--
-- Quem tentou sair e não conseguiu é só apertar "Desfazer sociedade" de novo: com a
-- função corrigida, agora funciona. Ninguém fica preso, e nenhuma sociedade de terceiro
-- é desfeita por um palpite meu.
