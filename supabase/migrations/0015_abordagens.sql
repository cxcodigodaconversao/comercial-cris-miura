-- ═════════════════════════════════════════════════════════════════════════
-- Abordagens aos participantes — 0015
--
-- Quem falou com quem, e o que foi conversado. Alimenta dois lugares:
--   · ficha do participante — histórico das conversas, para o próximo não
--     repetir a mesma pergunta nem atropelar quem já estava negociando;
--   · aba Análise — quantas pessoas cada um abordou.
--
-- Tabela própria, não um campo em `inscritos`:
--   · a mesma lead é abordada mais de uma vez, por pessoas diferentes;
--   · um campo de texto único seria sobrescrito pelo último a salvar, e no
--     salão duas pessoas editam ao mesmo tempo;
--   · a contagem por pessoa exige uma linha por abordagem.
--
-- `email` referencia o inscrito do evento (mesma chave de `inscritos`). Sem
-- FK de propósito: a base de inscritos é substituída inteira a cada
-- reimportação do painel, e o histórico de conversas precisa sobreviver a
-- isso.
-- ═════════════════════════════════════════════════════════════════════════

create table public.abordagens (
  id           uuid primary key default gen_random_uuid(),
  evento_id    uuid not null references public.eventos(id) on delete cascade,
  email        text not null,
  usuario_id   uuid references public.usuarios(id) on delete set null,
  por_nome     text not null,
  observacao   text not null,
  em           timestamptz not null default now()
);

create index abordagens_evento_email on public.abordagens (evento_id, email, em desc);
create index abordagens_evento_usuario on public.abordagens (evento_id, usuario_id);

alter table public.abordagens enable row level security;

-- Toda a equipe lê: o valor está justamente em ver o que o colega já falou.
create policy abordagens_leitura on public.abordagens
  for select to authenticated using (public.eh_equipe());

-- Cada um registra em seu próprio nome. Sem isso, dava para inflar a
-- contagem de abordagens de outra pessoa.
create policy abordagens_insercao on public.abordagens
  for insert to authenticated
  with check (public.eh_equipe() and usuario_id = auth.uid());

-- Corrigir ou apagar: só a própria, ou admin.
create policy abordagens_edicao on public.abordagens
  for update to authenticated
  using (public.eh_admin() or usuario_id = auth.uid())
  with check (public.eh_admin() or usuario_id = auth.uid());

create policy abordagens_exclusao on public.abordagens
  for delete to authenticated
  using (public.eh_admin() or usuario_id = auth.uid());

comment on table public.abordagens is
  'Conversas registradas com participantes do evento. Uma linha por abordagem; o histórico sobrevive à reimportação do painel.';
