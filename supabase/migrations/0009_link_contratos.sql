-- ═════════════════════════════════════════════════════════════════════════
-- Link do sistema de assinatura de contratos — 0009
--
-- Mesmo espírito do link_analise: o evento guarda a URL base do app de
-- assinatura (sistema à parte, com Supabase próprio, Autentique e Drive).
-- Preenchido, o botão "Contrato" de cada venda abre lá a tela de novo
-- contrato já com os dados da venda na URL. Vazio, o botão faz o que fazia
-- antes (gera o texto do plano pelo Gemini).
--
-- Guarde a URL BASE, sem /novo — ex.: https://dominio.com.br/assinatura-dex
-- ═════════════════════════════════════════════════════════════════════════

alter table public.eventos
  add column link_contratos text;

comment on column public.eventos.link_contratos is
  'URL base do sistema de assinatura de contratos (externo). Opcional. Sem /novo no final.';
