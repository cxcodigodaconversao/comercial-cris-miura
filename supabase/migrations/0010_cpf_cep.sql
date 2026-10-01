-- ═════════════════════════════════════════════════════════════════════════
-- CEP no cadastro — 0010
--
-- O CPF já existia em `vendas` e `leads` (vinha só do crachá; agora tem
-- campo na tela). O CEP é novo nas duas tabelas: o app manda para o
-- sistema de contratos, que busca o endereço completo por ele.
-- ═════════════════════════════════════════════════════════════════════════

alter table public.vendas add column if not exists cep text;
alter table public.leads  add column if not exists cep text;

comment on column public.vendas.cep is 'CEP do cliente. Vai para o contrato, que preenche o endereço.';
comment on column public.leads.cep  is 'CEP do participante (opcional, pode vir da importação).';
