-- ═════════════════════════════════════════════════════════════════════════
-- Permissões do papel `promotor` — o operador de contratos.
--
-- O trabalho dele é pegar cada venda registrada e gerar o texto do plano de
-- pagamento para o contrato. Para isso precisa ENXERGAR a venda de todo
-- mundo, mas não é da disputa comercial: nada de ranking, de totais do
-- evento ou de meta (isso é tratado nas telas).
--
-- No banco, o que importa garantir é o oposto do que ele vê: que ele NÃO
-- consiga alterar o dinheiro de uma venda que não é dele.
-- ═════════════════════════════════════════════════════════════════════════

-- ── Faz parte da equipe (entra no app, registra a própria venda) ────────
create or replace function public.eh_equipe()
returns boolean language sql stable as $$
  select public.papel_atual() in ('admin', 'gestor', 'closer', 'promotor')
$$;

-- ── Enxerga o evento inteiro ────────────────────────────────────────────
-- `ve_tudo` passa a significar "lê tudo do evento", e é usada nas políticas
-- de SELECT. Onde o sentido é "manda no evento" (editar venda alheia, mexer
-- em lead, apagar), as políticas usam papéis explícitos — ver abaixo.
create or replace function public.ve_tudo()
returns boolean language sql stable as $$
  select public.papel_atual() in ('admin', 'gestor', 'promotor')
$$;

-- Quem coordena o evento de fato: edita venda alheia, corrige cadastro de
-- lead, gere a equipe. O promotor NÃO entra aqui.
create or replace function public.coordena()
returns boolean language sql stable as $$
  select public.papel_atual() in ('admin', 'gestor')
$$;

-- ── Reapontar as políticas que significam "coordenar", não "ler" ───────
drop policy if exists equipe_escrita on public.evento_equipe;
create policy equipe_escrita on public.evento_equipe
  for all to authenticated using (public.coordena()) with check (public.coordena());

drop policy if exists leads_manutencao on public.leads;
create policy leads_manutencao on public.leads
  for all to authenticated using (public.coordena()) with check (public.coordena());

-- ── A trava que sustenta tudo ───────────────────────────────────────────
-- O promotor precisa de UPDATE em venda alheia para gravar o contrato. Sem
-- limite de coluna, isso seria permissão para reescrever valor e pontuação
-- de qualquer venda do evento.
--
-- A comparação é por linha inteira menos as colunas liberadas, e não por
-- lista de campos proibidos: assim uma coluna criada no futuro nasce
-- protegida, em vez de ficar aberta até alguém lembrar de adicioná-la.
create or replace function public.limitar_edicao_do_promotor()
returns trigger language plpgsql as $$
begin
  if auth.uid() is null or public.papel_atual() is distinct from 'promotor' then
    return new;
  end if;

  -- Na própria venda ele é dono e edita normalmente.
  if new.usuario_id = auth.uid() then
    return new;
  end if;

  if (to_jsonb(new) - 'contrato' - 'contrato_em' - 'atualizado_em')
     is distinct from
     (to_jsonb(old) - 'contrato' - 'contrato_em' - 'atualizado_em') then
    raise exception
      'Promotor só pode gravar o texto do contrato em vendas de outra pessoa.';
  end if;

  return new;
end $$;

create trigger vendas_limitar_promotor
  before update on public.vendas
  for each row execute function public.limitar_edicao_do_promotor();

-- ── Exclusão de venda segue só do admin ────────────────────────────────
-- (a política vendas_exclusao já usa eh_admin(); nada a mudar)

comment on function public.ve_tudo is
  'Lê o evento inteiro: admin, gestor e promotor. Para "manda no evento", use coordena().';
comment on function public.coordena is
  'Coordena o evento: admin e gestor. Exclui o promotor, que só lê e gera contrato.';
