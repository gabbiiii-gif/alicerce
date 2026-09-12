-- Desfazer sociedade: cada um volta a ver só as próprias obras.
--
-- A sociedade se desfaz por quem sai, nunca por quem fica. Todos os sócios têm poder de
-- dono, então "remover o outro" deixaria qualquer um expulsar qualquer um — e o dono da
-- obra poderia ser posto para fora da própria obra. Sair é sobre si mesmo e não tem esse
-- problema: se a parceria acabou, qualquer um dos dois resolve.

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

  -- Volto para o meu próprio grupo, sozinho. Quem ficou continua junto: sair é sobre
  -- mim, não dissolve o grupo dos outros.
  update public.profiles set grupo_id = v_eu where id = v_eu;

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

-- O que NÃO é apagado, de propósito: os lançamentos. Quem gastou, gastou, e a obra
-- precisa continuar batendo. O histórico guarda o autor mesmo depois da separação — o
-- nome pode deixar de aparecer (a policy de profiles para de devolver o perfil), e a
-- tela já cai para "alguém da equipe" nesse caso.
