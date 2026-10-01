-- Rastro de quem mexeu no acesso de quem.
--
-- `desativado_por` já existia; faltavam os pares de reativação e de reset de
-- senha. Sem eles, "por que o Renato foi desativado no meio do evento?" e
-- "quem gerou senha nova para essa pessoa?" ficam sem resposta.

alter table public.usuarios
  add column if not exists reativado_em      timestamptz,
  add column if not exists reativado_por     text,
  add column if not exists senha_resetada_em timestamptz,
  add column if not exists senha_resetada_por text;

-- Carimba a data sozinho quando o "por quem" é preenchido: a rota de API
-- passa a informar só o autor, e uma escrita futura que esqueça a data não
-- deixa o rastro pela metade.
create or replace function public.carimbar_rastro_de_acesso()
returns trigger language plpgsql as $$
begin
  if new.senha_resetada_por is distinct from old.senha_resetada_por then
    new.senha_resetada_em = now();
  end if;
  if new.ativo and not old.ativo then
    new.reativado_em = now();
  end if;
  return new;
end $$;

create trigger usuarios_carimbar_rastro
  before update on public.usuarios
  for each row execute function public.carimbar_rastro_de_acesso();
