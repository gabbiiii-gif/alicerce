-- Primeira letra maiúscula no que já está gravado.
--
-- O app passou a corrigir isso na hora de gravar, mas o que foi digitado antes continua
-- como estava: "roberto", "bem ai", "material". Esses textos aparecem como título na
-- lista de obras, no relatório e no PDF que vai para o cliente — e nome próprio em caixa
-- baixa num documento parece descuido de quem mandou.
--
-- Só a primeira letra. Mexer no meio estragaria o que a pessoa escreveu de propósito:
-- "Depósito São João" não pode virar "Depósito são joão", e "CNPJ" não pode virar "Cnpj".
--
-- A condição `~ '^[[:lower:]]'` pega só o que começa em minúscula, então rodar de novo
-- não muda nada — a migration é idempotente.

update public.obras
set nome = upper(left(nome, 1)) || substring(nome from 2)
where nome ~ '^[[:lower:]]';

update public.obras
set endereco = upper(left(endereco, 1)) || substring(endereco from 2)
where endereco is not null and endereco ~ '^[[:lower:]]';

update public.categorias
set nome = upper(left(nome, 1)) || substring(nome from 2)
where nome ~ '^[[:lower:]]';

update public.lancamentos
set descricao = upper(left(descricao, 1)) || substring(descricao from 2)
where descricao ~ '^[[:lower:]]';

update public.aditivos
set descricao = upper(left(descricao, 1)) || substring(descricao from 2)
where descricao ~ '^[[:lower:]]';

-- Os nomes de pessoa em profiles ficam de fora de propósito: vêm do Google ou do que a
-- pessoa escreveu no cadastro, e nome de gente não é campo para o app palpitar.
