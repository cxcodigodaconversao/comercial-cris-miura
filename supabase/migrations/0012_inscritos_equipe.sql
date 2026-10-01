-- ═════════════════════════════════════════════════════════════════════════
-- Participantes visíveis para toda a equipe — 0012
--
-- A migração 0011 restringiu `inscritos` a admin/gestor, porque a aba
-- Análise mostra agregados do evento (MQL, conversão por classe) — número
-- de time inteiro, que closer não vê, mesma regra do Ranking.
--
-- A aba Participantes é outra coisa: o closer precisa consultar UMA pessoa
-- antes de abordar (classe, o que ela respondeu, se confirmou presença) e
-- abrir o WhatsApp dela. Isso é o mesmo tipo de acesso que ele já tem em
-- `leads`, que traz nome, telefone, e-mail e CPF dos participantes.
--
-- Então a leitura passa a ser de toda a equipe. A escrita continua sem
-- policy nenhuma: só a API com service role importa (ver 0011).
-- ═════════════════════════════════════════════════════════════════════════

drop policy if exists inscritos_leitura on public.inscritos;

create policy inscritos_leitura on public.inscritos
  for select to authenticated
  using (public.eh_equipe());

comment on policy inscritos_leitura on public.inscritos is
  'Toda a equipe consulta participante a participante (aba Participantes). Os agregados da aba Análise ficam limitados a admin/gestor na própria tela.';
