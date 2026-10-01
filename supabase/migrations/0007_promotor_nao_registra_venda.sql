-- ═════════════════════════════════════════════════════════════════════════
-- O promotor deixa de registrar venda.
--
-- A aba some da tela, mas esconder botão não é permissão: sem esta política
-- a inserção continuaria valendo por chamada direta à API, com a mesma
-- credencial que a pessoa já tem no navegador.
--
-- O papel fica sendo o que sempre foi na prática: LER a venda de todo mundo
-- para gerar contrato. Nada além disso.
-- ═════════════════════════════════════════════════════════════════════════

create or replace function public.registra_venda()
returns boolean language sql stable as $$
  select public.papel_atual() in ('admin', 'gestor', 'closer')
$$;

comment on function public.registra_venda is
  'Quem pode lançar venda. Exclui o promotor, que só lê e gera contrato.';

drop policy if exists vendas_insercao on public.vendas;
create policy vendas_insercao on public.vendas
  for insert to authenticated
  with check (public.registra_venda() and usuario_id = auth.uid());
