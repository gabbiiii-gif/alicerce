-- Deixa o dono da obra apagar os arquivos dela no storage.
--
-- Apagar uma obra derruba por cascata tudo que está no banco: lançamentos, aditivos,
-- comprovantes, membros e convites. O storage não segue cascata — os arquivos ficam.
--
-- E a única policy de delete que existia era "autor apaga o próprio comprovante". Então,
-- ao apagar uma obra tocada a dois, as fotos enviadas pelo sócio não iam junto: viravam
-- lixo permanente, ocupando espaço, sem nenhuma linha no banco apontando para elas — nem
-- dá para saber depois de quem eram ou a que obra pertenciam.
--
-- Quem pode apagar a obra inteira pode apagar os arquivos dela. A policy usa e_dono, a
-- mesma que decide a exclusão da obra, então as duas permissões andam juntas por
-- construção: não existe caso em que a obra some e os arquivos fiquem.

create policy "dono apaga comprovante da obra"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'comprovantes'
    and public.e_dono(((storage.foldername(name))[1])::uuid)
  );

-- A policy antiga continua: quem enviou uma nota segue podendo descartá-la da própria
-- fila sem depender de ninguém. As duas convivem — no Postgres, policies de um mesmo
-- comando se somam, e basta uma permitir.
