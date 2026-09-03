-- ═════════════════════════════════════════════════════════════════════════
-- Comercial Cristina Miura — esquema inicial (migração Firestore → Postgres)
--
-- Decisões que valem registrar:
--
-- · A permissão vive numa FUNÇÃO security definer (papel_atual), não numa
--   lista. É o equivalente das custom claims do Firebase, mas sem depender
--   de o token estar atualizado: desativar alguém passa a valer na hora.
--
-- · `vendas.usuario_id` é ON DELETE RESTRICT. No Firestore, a regra "não
--   exclua quem tem venda" só existia no código da API — aqui o banco se
--   recusa. Dado de comissão não some por bug de aplicação.
--
-- · `venda_auditoria` NÃO tem FK para vendas, de propósito: o rastro precisa
--   sobreviver à exclusão da venda. No Firestore a subcoleção ficava órfã.
--
-- · Os campos de configuração do evento (produtos, faixas, regras, metas)
--   ficam em jsonb: são documentos editados inteiros pela tela, nunca
--   consultados por campo. Normalizar aqui só criaria junção sem ganho.
-- ═════════════════════════════════════════════════════════════════════════

-- ── Tipos ───────────────────────────────────────────────────────────────

create type public.papel as enum ('admin', 'gestor', 'closer');
create type public.status_evento as enum ('rascunho', 'ativo', 'encerrado', 'arquivado');
create type public.marca as enum ('IMA_BH', 'MENTORIA', 'CONGRESSO');
create type public.status_lead as enum ('novo', 'abordado', 'negociando', 'fechou', 'perdeu');
create type public.acao_auditoria as enum ('criou', 'editou', 'excluiu', 'gerou_contrato', 'recalculou');
create type public.criterio_desempate as enum ('recebido', 'valor', 'vendas', 'primeiro_a_atingir');

-- ── Usuários ────────────────────────────────────────────────────────────
-- Perfil 1:1 com auth.users. Substitui o EMAIL_MAP que vivia no código.

create table public.usuarios (
  id                   uuid primary key references auth.users(id) on delete cascade,
  email                text not null unique,
  nome                 text not null,
  papel                public.papel not null default 'closer',
  ativo                boolean not null default true,
  sck                  text,
  telefone             text,
  precisa_trocar_senha boolean not null default true,
  criado_em            timestamptz not null default now(),
  criado_por           text,
  desativado_em        timestamptz,
  desativado_por       text
);

comment on table public.usuarios is
  'Perfil e permissão. Escrita só pelo service role (rotas /api/usuarios).';

-- ── Funções de permissão ────────────────────────────────────────────────
-- security definer para não recursar: as políticas de `usuarios` chamariam
-- papel_atual(), que leria `usuarios`, que aplicaria as políticas de novo.

create or replace function public.papel_atual()
returns public.papel
language sql
stable
security definer
set search_path = public
as $$
  select papel from public.usuarios where id = auth.uid() and ativo
$$;

comment on function public.papel_atual is
  'Papel do usuário logado, ou NULL se não existe ou está desativado. NULL = sem acesso a nada.';

create or replace function public.eh_admin()
returns boolean language sql stable as $$ select public.papel_atual() = 'admin' $$;

-- Admin e gestor enxergam o evento inteiro (ranking, todas as vendas, funil).
create or replace function public.ve_tudo()
returns boolean language sql stable as $$
  select public.papel_atual() in ('admin', 'gestor')
$$;

-- Qualquer usuário ativo do sistema.
create or replace function public.eh_equipe()
returns boolean language sql stable as $$ select public.papel_atual() is not null $$;

-- ── Eventos ─────────────────────────────────────────────────────────────

create table public.eventos (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null,
  slug         text not null unique,
  marca        public.marca not null default 'IMA_BH',
  cidade       text,
  uf           text,
  local        text,
  data_inicio  date not null,
  data_fim     date not null,
  status       public.status_evento not null default 'rascunho',

  -- Configuração editada como documento inteiro pela tela do evento.
  produtos     jsonb not null default '[]'::jsonb,
  faixas       jsonb not null default '[]'::jsonb,
  regras       jsonb not null default '[]'::jsonb,
  metas        jsonb not null default '[]'::jsonb,
  desempate    public.criterio_desempate not null default 'recebido',

  criado_em    timestamptz not null default now(),
  criado_por   text,

  constraint datas_coerentes check (data_fim >= data_inicio)
);

create index eventos_status_idx on public.eventos (status, data_inicio desc);

-- Equipe do evento: resolve "o vendedor está numa turma da mentoria mas não na outra".
create table public.evento_equipe (
  evento_id       uuid not null references public.eventos(id) on delete cascade,
  usuario_id      uuid not null references public.usuarios(id) on delete cascade,
  papel_no_evento text not null default 'closer',
  meta_individual numeric(12, 2),
  ativo           boolean not null default true,
  primary key (evento_id, usuario_id)
);

-- ── Leads (base de credenciamento, por evento) ──────────────────────────

create table public.leads (
  id            uuid primary key default gen_random_uuid(),
  evento_id     uuid not null references public.eventos(id) on delete cascade,
  -- O que está impresso no QR do crachá. Único DENTRO do evento: o mesmo
  -- número pode se repetir em edições diferentes.
  codigo_cracha text not null,
  tipo          text,
  nome          text not null,
  email         text,
  cpf           text,
  telefone      text,
  especialidade text,
  cor           text,

  -- Funil (os campos abordado_* existiam no Firestore e nenhuma tela usava)
  status        public.status_lead not null default 'novo',
  abordado_por  uuid references public.usuarios(id) on delete set null,
  abordado_em   timestamptz,
  motivo_perda  text,

  unique (evento_id, codigo_cracha)
);

create index leads_evento_nome_idx on public.leads (evento_id, nome);
create index leads_evento_status_idx on public.leads (evento_id, status);
create index leads_cpf_idx on public.leads (evento_id, cpf) where cpf is not null;

-- ── Vendas ──────────────────────────────────────────────────────────────

create table public.vendas (
  -- Gerado no CLIENTE: dois toques no botão "Confirmar venda" viram um
  -- upsert do mesmo id, não duas vendas.
  id             uuid primary key,
  evento_id      uuid not null references public.eventos(id) on delete restrict,

  -- RESTRICT é a trava de verdade contra excluir quem já vendeu.
  usuario_id     uuid not null references public.usuarios(id) on delete restrict,
  -- Nome desnormalizado: o histórico continua legível mesmo se o cadastro mudar.
  closer_nome    text not null,
  email_closer   text not null,

  cliente        text not null,
  email          text,
  telefone       text,
  cpf            text,
  lead_id        uuid references public.leads(id) on delete set null,

  data_venda     date,
  produto        text,
  produto_id     text,

  valor          numeric(12, 2) not null default 0,
  recebido       numeric(12, 2) not null default 0,
  faixa          smallint,
  faixa_label    text,
  cadeira        boolean not null default false,
  valor_cadeira  numeric(12, 2) not null default 0,
  completo       boolean not null default false,
  restante       numeric(12, 2) not null default 0,
  negociacao     text,
  observacao     text,

  -- Pontuação CONGELADA no registro: mudar a regra depois não pode
  -- reescrever o ranking sozinho.
  pts            numeric(6, 2) not null default 0,
  pontos_detalhe jsonb not null default '[]'::jsonb,

  contrato       text,
  contrato_em    timestamptz,

  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),

  constraint valores_nao_negativos check (valor >= 0 and recebido >= 0 and restante >= 0)
);

create index vendas_evento_idx on public.vendas (evento_id, criado_em desc);
create index vendas_evento_usuario_idx on public.vendas (evento_id, usuario_id, criado_em desc);
create index vendas_lead_idx on public.vendas (lead_id) where lead_id is not null;

create or replace function public.tocar_atualizado_em()
returns trigger language plpgsql as $$
begin
  new.atualizado_em = now();
  return new;
end $$;

create trigger vendas_atualizado_em
  before update on public.vendas
  for each row execute function public.tocar_atualizado_em();

-- ── Auditoria ───────────────────────────────────────────────────────────
-- Sem FK para vendas: o rastro tem que sobreviver à exclusão.

create table public.venda_auditoria (
  id           uuid primary key default gen_random_uuid(),
  venda_id     uuid not null,
  evento_id    uuid,
  acao         public.acao_auditoria not null,
  por_usuario  uuid references public.usuarios(id) on delete set null,
  por_nome     text not null,
  alteracoes   jsonb,
  em           timestamptz not null default now()
);

create index venda_auditoria_venda_idx on public.venda_auditoria (venda_id, em desc);
create index venda_auditoria_evento_idx on public.venda_auditoria (evento_id, em desc);

-- ── Links de pagamento (Hotmart) ────────────────────────────────────────
-- vendedor_nome é TEXTO, não FK: a base traz nomes que nunca existiram como
-- usuário do app (Zuca, Valadares, "Sem nome (casa)"). As duas listas nunca
-- foram a mesma coisa e forçar a junção perderia link.

create table public.links (
  id            uuid primary key default gen_random_uuid(),
  evento_id     uuid not null references public.eventos(id) on delete cascade,
  vendedor_nome text not null,
  sck           text,
  status        text,
  oferta        text not null,
  valor         numeric(12, 2),
  condicao      text,
  url           text not null,
  unique (evento_id, oferta, vendedor_nome)
);

create index links_evento_vendedor_idx on public.links (evento_id, vendedor_nome);

-- ═════════════════════════════════════════════════════════════════════════
-- RLS — tudo fechado por padrão; nada é acessível sem política explícita.
-- O service role (rotas de API) ignora RLS por definição.
-- ═════════════════════════════════════════════════════════════════════════

alter table public.usuarios        enable row level security;
alter table public.eventos         enable row level security;
alter table public.evento_equipe   enable row level security;
alter table public.leads           enable row level security;
alter table public.vendas          enable row level security;
alter table public.venda_auditoria enable row level security;
alter table public.links           enable row level security;

-- ── usuarios ────────────────────────────────────────────────────────────
-- A equipe lê a lista (o ranking precisa dos nomes; não há senha aqui).
create policy usuarios_leitura on public.usuarios
  for select to authenticated using (public.eh_equipe());

-- Sem política de insert/delete: só o service role cadastra e exclui. Se o
-- cliente pudesse escrever aqui, qualquer closer viraria admin editando o
-- próprio papel.
--
-- Única escrita permitida: baixar a própria flag de senha temporária.
-- QUAIS colunas podem mudar é responsabilidade do trigger abaixo — em
-- WITH CHECK só existe a linha NOVA, então não há como comparar com a antiga.
create policy usuarios_baixa_flag_senha on public.usuarios
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and precisa_trocar_senha = false);

create or replace function public.travar_colunas_usuario()
returns trigger language plpgsql as $$
begin
  -- O service role precisa poder mudar tudo (é ele quem gere a equipe).
  if auth.uid() is null or current_setting('role', true) = 'service_role' then
    return new;
  end if;
  if new.papel is distinct from old.papel
     or new.ativo is distinct from old.ativo
     or new.email is distinct from old.email
     or new.nome  is distinct from old.nome
     or new.sck   is distinct from old.sck then
    raise exception 'Só um administrador altera cadastro de usuário.';
  end if;
  return new;
end $$;

create trigger usuarios_travar_colunas
  before update on public.usuarios
  for each row execute function public.travar_colunas_usuario();

-- ── eventos ─────────────────────────────────────────────────────────────
create policy eventos_leitura on public.eventos
  for select to authenticated using (public.eh_equipe());

-- Regras de pontuação e metas mexem em comissão: só admin.
create policy eventos_escrita on public.eventos
  for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

create policy equipe_leitura on public.evento_equipe
  for select to authenticated using (public.eh_equipe());
create policy equipe_escrita on public.evento_equipe
  for all to authenticated using (public.ve_tudo()) with check (public.ve_tudo());

-- ── vendas ──────────────────────────────────────────────────────────────
create policy vendas_leitura on public.vendas
  for select to authenticated
  using (public.ve_tudo() or usuario_id = auth.uid());

-- O closer registra a própria venda, e só a própria.
create policy vendas_insercao on public.vendas
  for insert to authenticated
  with check (public.eh_equipe() and usuario_id = auth.uid());

create policy vendas_edicao on public.vendas
  for update to authenticated
  using (public.ve_tudo() or usuario_id = auth.uid())
  with check (public.ve_tudo() or usuario_id = auth.uid());

create policy vendas_exclusao on public.vendas
  for delete to authenticated using (public.eh_admin());

-- Ninguém transfere venda para outro dono nem para outro evento — seria
-- roubar ponto no ranking. Trigger, não política: WITH CHECK enxerga só a
-- linha nova e portanto não consegue comparar com a antiga.
create or replace function public.impedir_troca_de_dono()
returns trigger language plpgsql as $$
begin
  if new.usuario_id is distinct from old.usuario_id then
    raise exception 'Não é permitido transferir a venda para outro vendedor.';
  end if;
  if new.evento_id is distinct from old.evento_id then
    raise exception 'Não é permitido mover a venda para outro evento.';
  end if;
  return new;
end $$;

create trigger vendas_impedir_troca_de_dono
  before update on public.vendas
  for each row execute function public.impedir_troca_de_dono();

-- ── auditoria: só cresce ────────────────────────────────────────────────
create policy auditoria_leitura on public.venda_auditoria
  for select to authenticated
  using (public.ve_tudo() or por_usuario = auth.uid());

create policy auditoria_insercao on public.venda_auditoria
  for insert to authenticated
  with check (public.eh_equipe() and por_usuario = auth.uid());

-- Sem update nem delete: rastro que pode ser reescrito não é rastro.

-- ── leads ───────────────────────────────────────────────────────────────
create policy leads_leitura on public.leads
  for select to authenticated using (public.eh_equipe());

create policy leads_manutencao on public.leads
  for all to authenticated using (public.ve_tudo()) with check (public.ve_tudo());

-- O closer mexe no funil, mas não edita cadastro do lead (nome, CPF, e-mail).
-- A política libera o UPDATE; o trigger define QUAIS colunas podem mudar.
create policy leads_funil on public.leads
  for update to authenticated
  using (public.eh_equipe())
  with check (public.eh_equipe());

create or replace function public.travar_cadastro_do_lead()
returns trigger language plpgsql as $$
begin
  if public.ve_tudo() or auth.uid() is null then
    return new; -- admin, gestor e service role corrigem cadastro
  end if;
  if new.nome is distinct from old.nome
     or new.cpf is distinct from old.cpf
     or new.email is distinct from old.email
     or new.telefone is distinct from old.telefone
     or new.codigo_cracha is distinct from old.codigo_cracha
     or new.evento_id is distinct from old.evento_id then
    raise exception 'Vendedor altera apenas o funil do lead, não o cadastro.';
  end if;
  return new;
end $$;

create trigger leads_travar_cadastro
  before update on public.leads
  for each row execute function public.travar_cadastro_do_lead();

-- ── links ───────────────────────────────────────────────────────────────
create policy links_leitura on public.links
  for select to authenticated using (public.eh_equipe());
create policy links_escrita on public.links
  for all to authenticated using (public.eh_admin()) with check (public.eh_admin());
