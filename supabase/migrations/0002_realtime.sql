-- ═════════════════════════════════════════════════════════════════════════
-- Realtime — o ranking precisa se mover sozinho durante o evento.
--
-- No Firestore isso vinha de graça com onSnapshot. No Supabase é preciso
-- publicar a tabela explicitamente. O RLS continua valendo: cada assinante
-- só recebe as mudanças das linhas que já poderia ler.
--
-- `usuarios` entra porque desativar alguém tem que sumir do ranking na hora,
-- e `eventos` porque mudar meta ou regra precisa chegar aos aparelhos.
-- `leads` NÃO entra: são 1.463 linhas por evento e nenhuma tela depende de
-- ver movimentação de lead em tempo real — só geraria tráfego.
-- ═════════════════════════════════════════════════════════════════════════

alter publication supabase_realtime add table public.vendas;
alter publication supabase_realtime add table public.usuarios;
alter publication supabase_realtime add table public.eventos;

-- REPLICA IDENTITY FULL faz o evento de DELETE trazer a linha inteira, não
-- só a chave primária. Sem isso o app recebe a exclusão de uma venda sem
-- saber de qual evento ela era, e não consegue decidir se deve reagir.
alter table public.vendas replica identity full;
