-- Corrige efeito colateral da 0005.
--
-- Ao incluir o promotor em `ve_tudo()`, o trigger que protege o cadastro do
-- lead passou a liberá-lo junto — ele usava `ve_tudo()` querendo dizer
-- "quem coordena", e o sentido dessa função mudou para "quem lê tudo".
--
-- Pego pelo teste `promotor NÃO edita cadastro de lead` em
-- scripts/testar-rls.mjs, que falhou assim que a 0005 entrou.

create or replace function public.travar_cadastro_do_lead()
returns trigger language plpgsql as $$
begin
  -- coordena() = admin e gestor. O service role entra pelo auth.uid() nulo.
  if public.coordena() or auth.uid() is null then
    return new;
  end if;
  if new.nome is distinct from old.nome
     or new.cpf is distinct from old.cpf
     or new.email is distinct from old.email
     or new.telefone is distinct from old.telefone
     or new.codigo_cracha is distinct from old.codigo_cracha
     or new.evento_id is distinct from old.evento_id then
    raise exception 'Só admin ou gestor altera o cadastro do lead.';
  end if;
  return new;
end $$;
