-- ═════════════════════════════════════════════════════════════════════════
-- Link de análise de dados — 0008
--
-- Campo simples e opcional no evento: a URL de um painel externo (o
-- dashboard de Lead Score / check-in, construído à parte, fora deste app).
-- Não é um recurso deste sistema — é só a porta de entrada para ele.
--
-- Fica em branco por padrão; quando preenchido, o app mostra um atalho no
-- menu que abre a URL numa aba nova. Sem validação de formato de propósito:
-- é o admin colando o link, não um formulário público.
-- ═════════════════════════════════════════════════════════════════════════

alter table public.eventos
  add column link_analise text;

comment on column public.eventos.link_analise is
  'URL do painel de análise de dados do evento (dashboard externo, fora deste app). Opcional.';
