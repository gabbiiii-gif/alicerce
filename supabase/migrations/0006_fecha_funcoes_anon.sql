-- Fecha as funções para quem não entrou.
--
-- O linter do Supabase apontou que toda função SECURITY DEFINER do schema public é
-- chamável pelo papel `anon` — quem ainda não fez login — via /rest/v1/rpc/. No
-- PostgreSQL, função nova nasce com EXECUTE para PUBLIC, e no Supabase PUBLIC inclui
-- anon.
--
-- Nenhuma delas vaza dado hoje: todas decidem a partir de auth.uid(), que é nulo sem
-- sessão, então devolvem falso, vazio ou erro. O ganho aqui é de superfície — uma porta
-- que não precisa existir é uma porta a menos para errar em algum descuido futuro. As
-- policies do app são todas `to authenticated`, então anon nunca precisou dessas funções.
--
-- O padrão é sempre o mesmo: tira de PUBLIC (senão anon continua entrando por herança) e
-- devolve nominalmente a quem usa.

-- Helpers de RLS. O EXECUTE para `authenticated` NÃO é opcional: as policies chamam estas
-- funções durante a consulta do próprio usuário, e sem permissão o acesso inteiro do app
-- quebraria. service_role entra porque as edge functions rodam com ele.
revoke execute on function public.e_membro(uuid) from public;
grant execute on function public.e_membro(uuid) to authenticated, service_role;

revoke execute on function public.e_dono(uuid) from public;
grant execute on function public.e_dono(uuid) to authenticated, service_role;

revoke execute on function public.mesmo_grupo(uuid) from public;
grant execute on function public.mesmo_grupo(uuid) to authenticated, service_role;

revoke execute on function public.compartilha_obra(uuid) from public;
grant execute on function public.compartilha_obra(uuid) to authenticated, service_role;

revoke execute on function public.meus_donos() from public;
grant execute on function public.meus_donos() to authenticated, service_role;

-- Ações do app. São chamadas de dentro de uma sessão, sempre.
revoke execute on function public.aceitar_convite(text) from public;
grant execute on function public.aceitar_convite(text) to authenticated;

revoke execute on function public.sair_da_sociedade() from public;
grant execute on function public.sair_da_sociedade() to authenticated;

-- handle_new_user() e handle_nova_obra() ficam como estão, de propósito.
--
-- O linter também as aponta, e a tentação é fechá-las junto. Mas são funções de TRIGGER:
-- dependem do registro `new`, que só existe quando o banco as dispara. Chamada por RPC,
-- cada uma falha sozinha — o ganho de revogar é perto de zero.
--
-- Do outro lado, o risco é concreto: handle_new_user roda no INSERT em auth.users, feito
-- por um papel interno do Supabase. Tirar EXECUTE de PUBLIC sem saber exatamente qual
-- papel dispara o trigger pode quebrar o cadastro de usuário novo — e isso só apareceria
-- na próxima pessoa que tentasse entrar no app, sem erro nenhum aqui.
--
-- Trocar um risco real de quebrar o cadastro por um ganho teórico de superfície é um mau
-- negócio. Fica registrado como decisão, não como esquecimento.
