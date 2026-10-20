-- Entrada com quem recebeu o dinheiro do cliente.
--
-- Até aqui a entrada contava para quem a lançou. Na obra Lava Jato os dois sócios lançaram
-- cada um "a sua metade" e ainda registraram o repasse, e o "Com cada um" do relatório
-- mostrou um no negativo e o outro com o dobro (reunião de 19/10/2026). A regra combinada:
-- quem recebe o dinheiro é o responsável por ele e pelo repasse ao sócio. Agora a entrada diz
-- de quem é o dinheiro, independente de quem digitou.
--
-- Nulo quer dizer "quem lançou": é o caso de todas as entradas antigas, e o app manda nulo
-- quando a pessoa marca a si mesma. Assim o app continua funcionando antes desta migration.
--
-- Pode rodar de novo sem estragar nada.

alter table public.lancamentos
  add column if not exists recebido_por uuid references public.profiles on delete set null;

-- Só entrada tem "quem recebeu": saída é sempre de quem pagou, que é quem lançou.
alter table public.lancamentos drop constraint if exists recebido_por_so_em_entrada;
alter table public.lancamentos
  add constraint recebido_por_so_em_entrada check (recebido_por is null or tipo = 'entrada');

-- Quem recebeu tem que ser da obra: membro dela ou sócio do dono. Sem isto daria para pôr a
-- entrada no nome de qualquer perfil, inclusive de fora do grupo.
create or replace function public.confere_recebido_por()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.recebido_por is null or new.recebido_por = new.autor_id then
    return new;
  end if;

  if exists (
    select 1 from public.obra_membros m
    where m.obra_id = new.obra_id and m.user_id = new.recebido_por
  ) or exists (
    select 1
    from public.obras o
    join public.profiles dono on dono.id = o.dono_id
    join public.profiles quem on quem.id = new.recebido_por
    where o.id = new.obra_id and quem.grupo_id = dono.grupo_id
  ) then
    return new;
  end if;

  raise exception 'quem recebeu a entrada precisa ser da obra';
end;
$$;

drop trigger if exists confere_recebido_por on public.lancamentos;
create trigger confere_recebido_por
  before insert or update of recebido_por on public.lancamentos
  for each row execute function public.confere_recebido_por();
