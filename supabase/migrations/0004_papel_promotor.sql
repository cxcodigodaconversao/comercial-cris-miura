-- @sem-transacao
--
-- Adiciona o papel `promotor` ao enum.
--
-- Roda fora de transação de propósito: `ALTER TYPE ... ADD VALUE` até é
-- aceito dentro de uma no PG 12+, mas o valor novo não pode ser USADO na
-- mesma transação — e as funções da migração 0005 referenciam 'promotor',
-- o que faria a validação do corpo falhar. Por isso são dois arquivos.

alter type public.papel add value if not exists 'promotor';
