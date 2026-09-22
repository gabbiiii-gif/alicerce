-- O sócio passa a ver as notas fiscais da obra, não só as que ele mesmo mandou.
--
-- Só as notas LANÇADAS (status 'confirmado'). A fila de quem ainda está conferindo continua
-- pessoal: é rascunho, com leitura do agente ainda por corrigir, e mostrar isso ao outro
-- só geraria dúvida sobre um valor que nem entrou nas contas.
--
-- Os arquivos no storage já eram visíveis para quem participa da obra (0001, "membro vê
-- comprovantes da obra"); faltava a linha que diz qual arquivo é de qual lançamento.
--
-- Soma à policy "vê a própria fila" — policies de select valem por OU. Edição e descarte
-- continuam só do autor.
create policy "membro vê notas lançadas da obra"
  on public.comprovantes for select to authenticated
  using (status = 'confirmado' and public.e_membro(obra_id));
