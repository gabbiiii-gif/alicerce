-- Quem é o titular da assinatura do grupo.
--
-- O convidado enxerga a MESMA linha de assinaturas do titular — é assim que ele herda o
-- plano sem pagar. Só que, sem saber quem pagou, a tela de Plano ofereceria a ele o
-- botão "Gerenciar assinatura", que abre o portal do Stripe: de lá o convidado poderia
-- trocar o cartão de outra pessoa ou cancelar a assinatura dela.
--
-- Não dá para deduzir o titular do grupo_id. Ele até costuma ser o id de quem abriu o
-- grupo, mas sair_da_sociedade() troca o grupo_id por um uuid novo em folha — e aí o
-- titular deixaria de se reconhecer. Quem sabe de verdade é o checkout: o titular é
-- quem passou o cartão. Ele vai no metadata da assinatura e o webhook grava aqui.
--
-- Segura de aplicar a qualquer momento: coluna nova, opcional, ninguém muda de
-- comportamento. Precisa entrar ANTES de publicar a versão nova do webhook — que grava
-- esta coluna e falharia ao gravar se ela não existisse.

alter table public.assinaturas add column if not exists titular_id uuid;

-- Entra na leitura do app junto com as outras: é a tela de Plano que precisa comparar
-- com o usuário da sessão. Os ids do Stripe continuam fora.
grant select (grupo_id, status, vale_ate, titular_id) on public.assinaturas to authenticated;

-- Linhas que nasceram antes desta coluna ficam sem titular, e aí ninguém do grupo é
-- reconhecido como dono do plano — o convidado veria o botão de cancelar.
--
-- O chute certo para essas: quem abriu o grupo. Todo perfil nasce com grupo_id igual ao
-- próprio id (0003), então `p.id = p.grupo_id` é quem começou. Não vale para quem já
-- passou por sair_da_sociedade(), que ganha um grupo_id novo — mas essas assinaturas
-- ficam sem titular e podem ser ajustadas na mão, o que é melhor do que apontar para a
-- pessoa errada.
update public.assinaturas a
set titular_id = p.id
from public.profiles p
where p.grupo_id = a.grupo_id
  and p.id = p.grupo_id
  and a.titular_id is null;
