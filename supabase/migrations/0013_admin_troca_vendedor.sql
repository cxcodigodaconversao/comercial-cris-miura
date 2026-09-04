-- ═════════════════════════════════════════════════════════════════════════
-- Admin pode corrigir o vendedor de uma venda — 0013
--
-- A trava original (0001) impedia QUALQUER troca de dono, porque transferir
-- venda é transferir ponto no ranking e comissão. A regra continua valendo
-- para gestor, closer e promotor.
--
-- O que muda: o admin passa a poder corrigir. O caso real é banal e
-- frequente — a venda foi lançada no login errado (celular emprestado no
-- salão, closer logado no aparelho do colega) e hoje a única saída é
-- excluir e refazer, o que perde o histórico e a auditoria da venda.
--
-- O que NÃO muda:
--   · mover venda para outro evento continua proibido para todos;
--   · a troca é registrada em venda_auditoria pelo app, como toda edição.
-- ═════════════════════════════════════════════════════════════════════════

create or replace function public.impedir_troca_de_dono()
returns trigger language plpgsql as $$
begin
  if new.usuario_id is distinct from old.usuario_id and not public.eh_admin() then
    raise exception 'Não é permitido transferir a venda para outro vendedor.';
  end if;
  if new.evento_id is distinct from old.evento_id then
    raise exception 'Não é permitido mover a venda para outro evento.';
  end if;
  return new;
end $$;

comment on function public.impedir_troca_de_dono is
  'Trava a troca de evento para todos e a troca de vendedor para todos, menos admin (correção de venda lançada no login errado).';
