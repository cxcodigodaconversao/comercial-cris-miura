-- ═════════════════════════════════════════════════════════════════════════
-- Inscritos com Lead Score — 0011
--
-- Alimenta a aba "Análise" do app. Os dados vêm do painel de conversão
-- (o index.html gerado a partir da planilha de inscritos + formulário de
-- perfil): o admin sobe o arquivo e a API extrai o JSON embutido.
--
-- Por que uma tabela própria, e não colunas em `leads`:
--   · `leads` é a lista do crachá (quem o closer aborda no salão). Inscrito
--     é outra coisa: quem preencheu inscrição, tenha ou não vindo. As duas
--     listas nem sempre batem, e misturá-las faria a importação de uma
--     bagunçar a outra.
--   · A chave aqui é o e-mail, porque é o que liga inscrito ↔ venda (a
--     venda guarda o e-mail do cliente). Essa junção é o que o painel
--     estático não consegue fazer: conversão por classe de Lead Score.
--
-- `extras` guarda o resto das ~55 colunas do painel sem virar 55 colunas
-- aqui: o que a tela usa está tipado; o que ainda não usa, fica disponível.
-- ═════════════════════════════════════════════════════════════════════════

create table public.inscritos (
  evento_id        uuid not null references public.eventos(id) on delete cascade,
  email            text not null,                  -- minúsculo, sem espaços
  nome             text not null,
  whatsapp         text,

  -- Lead Score (perfil 70% + comprometimento 30%). 'X' = não respondeu.
  classe           text not null default 'X',
  nota             numeric,
  perfil           numeric,
  comprometimento  numeric,
  tipo             text,                           -- completo | confirmado, perfil menor…
  ja_aluno         boolean,

  -- Perfil declarado
  faturamento      text,
  idade            text,
  tempo_formado    text,
  area_atuacao     text,
  categoria_ticket text,                           -- Essencial | Aluno
  tem_produto      boolean not null default false,
  produtos         text,

  -- Presença
  checkin_feito    boolean not null default false,
  d1               boolean not null default false,
  d2               boolean not null default false,
  d3               boolean not null default false,

  -- Funil de contato
  ligou            boolean not null default false,
  resultado_ligacao text,
  contato_confirmou text,                          -- Confirmou | Desconfirmou

  extras           jsonb not null default '{}'::jsonb,
  importado_em     timestamptz not null default now(),

  primary key (evento_id, email)
);

create index inscritos_evento_classe on public.inscritos (evento_id, classe);

alter table public.inscritos enable row level security;

-- Leitura: quem vê agregados (admin/gestor). Closer não vê a base inteira.
create policy inscritos_leitura on public.inscritos
  for select to authenticated
  using (public.eh_admin() or public.papel_atual() = 'gestor');

-- Escrita: só pela API com a service role (que ignora RLS). Nenhuma policy
-- de insert/update/delete de propósito.

comment on table public.inscritos is
  'Inscritos do evento com Lead Score, importados do painel de conversão. Chave: e-mail.';
