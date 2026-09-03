# Subindo o banco do zero

Este projeto precisa de um **projeto Supabase próprio** — não reaproveite o
de nenhum outro app do grupo (Tubarões, IMA BH-dashboard, etc). Bancos
separados por cliente evitam qualquer chance de um evento aparecer no lugar
errado.

## Passo a passo

1. Crie um projeto no [Supabase](https://supabase.com).
2. Copie URL, anon key e service role key para o `.env.local`
   (ver `.env.example`).
3. Aplique as migrações, **na ordem**:

```bash
npm run db:aplicar supabase/migrations/0001_esquema_inicial.sql
npm run db:aplicar supabase/migrations/0002_realtime.sql
npm run db:aplicar supabase/migrations/0003_rastro_de_acesso.sql
npm run db:aplicar supabase/migrations/0004_papel_promotor.sql
npm run db:aplicar supabase/migrations/0005_permissoes_do_promotor.sql
npm run db:aplicar supabase/migrations/0006_corrigir_trava_do_lead.sql
npm run db:aplicar supabase/migrations/0007_promotor_nao_registra_venda.sql
npm run db:aplicar supabase/migrations/0008_link_analise.sql
```

Sem terminal à mão? Cole cada `.sql` no **SQL Editor** do painel do Supabase,
na mesma ordem — ou use o arquivo único `TUDO-EM-UM.sql` se você tiver
gerado um (junta as 8 migrações numa colagem só).

4. Crie o primeiro admin com `node scripts/criar-usuario.mjs` (o app trava o
   primeiro acesso na troca de senha obrigatória), ou manualmente: crie o
   usuário em Authentication → Add user (marcando "Auto Confirm User") e
   depois insira a linha em `usuarios` com o UID gerado.
5. Cadastre o evento pela tela e importe os participantes (planilha .xlsx) na
   tela de importação.

## As regras de acesso

`supabase/migrations/0001_esquema_inicial.sql` tem o modelo de dados e as
políticas de permissão em SQL, comentadas decisão a decisão.

| Papel | Pode |
|---|---|
| `admin` | Tudo: usuários, eventos, regras de pontuação, excluir vendas |
| `gestor` | Vê e edita tudo do evento, sem mexer no time nem nas regras |
| `closer` | Registra e edita as **próprias** vendas; vê os próprios pontos |
| `promotor` | Lê a venda de todos para gerar contrato; não registra venda; sem ranking e sem totais |

Três garantias que valem manter, porque cada uma nasceu de um problema real:

1. **Ninguém transfere uma venda para outro dono.** Seria roubar ponto no
   ranking.
2. **O promotor só grava o campo do contrato em venda de outra pessoa.** Sem
   esse limite, quem gera contrato poderia reescrever valor e pontuação de
   qualquer venda do evento.
3. **Usuário com venda não pode ser excluído, só desativado.** Chave
   estrangeira `ON DELETE RESTRICT` no Postgres.

## O campo `link_analise` (migração 0008)

Coluna simples de texto na tabela `eventos`, opcional, sem validação de
formato. Guarda a URL do painel de análise (Lead Score / check-in) — que é um
sistema à parte, publicado fora deste projeto. O app só mostra um atalho no
menu quando o campo está preenchido; não busca nem sincroniza dado nenhum
desse painel.

## Dado sensível

`leads` guarda CPF, telefone e e-mail de participantes reais. Trate qualquer
exportação como confidencial e nunca a suba em repositório público.
