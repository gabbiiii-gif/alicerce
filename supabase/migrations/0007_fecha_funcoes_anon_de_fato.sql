-- A 0007 existe porque a 0006 não bastou.
--
-- A 0006 revogou EXECUTE de PUBLIC, o que resolveria num Postgres de fábrica. No Supabase
-- não resolve: ele concede EXECUTE NOMINALMENTE a `anon` e `authenticated` nas funções do
-- schema public (default privileges do projeto). Tirar de PUBLIC não mexe num grant
-- nominal — são permissões independentes.
--
-- Medido depois de aplicar a 0006: chamando /rest/v1/rpc/ com a chave anon,
-- `meus_donos` ainda devolvia [null] e `sair_da_sociedade` ainda chegava até a guarda
-- interna "sem sessão". Ou seja: rodando.
--
-- É o mesmo formato de engano do UPDATE por coluna em profiles.grupo_id: revogar no lugar
-- errado deixa a aparência de proteção sem a proteção. Por isso a verificação aqui não é
-- ler o SQL e concluir que está certo — é chamar de fora e ver o que responde.

revoke execute on function public.e_membro(uuid) from anon;
revoke execute on function public.e_dono(uuid) from anon;
revoke execute on function public.mesmo_grupo(uuid) from anon;
revoke execute on function public.compartilha_obra(uuid) from anon;
revoke execute on function public.meus_donos() from anon;
revoke execute on function public.aceitar_convite(text) from anon;
revoke execute on function public.sair_da_sociedade() from anon;

-- `authenticated` continua com tudo: as policies chamam os helpers durante a consulta do
-- próprio usuário, e as duas ações são feitas de dentro de uma sessão. Revogar aqui
-- derrubaria o app inteiro.

-- handle_new_user() e handle_nova_obra() seguem intocadas, pelo motivo escrito na 0006:
-- são funções de trigger, falham sozinhas por RPC, e mexer nelas arrisca o cadastro de
-- usuário novo sem ganho real.
