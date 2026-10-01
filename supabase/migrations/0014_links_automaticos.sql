-- ═════════════════════════════════════════════════════════════════════════
-- Catálogo de links automático — 0014
--
-- O problema: o link de pagamento da Hotmart é o MESMO em todo evento (só
-- muda o `sck`, que é o rastreio de quem recebe a comissão). Mesmo assim,
-- cada evento novo nascia sem link nenhum, e alguém tinha de recadastrar
-- as 37 ofertas na mão, para cada vendedor.
--
-- A partir daqui, o catálogo se propaga sozinho:
--   · evento novo  → recebe o catálogo inteiro, para "Casa" e para todos os
--                    vendedores ativos;
--   · usuário novo → recebe o catálogo de todos os eventos que já existem.
--
-- De onde sai o catálogo: do evento que hoje tem mais ofertas distintas
-- (`catalogo_mestre`). Não há "evento modelo" marcado no banco, e usar o
-- mais completo é o que não depende de ninguém lembrar de marcar nada.
--
-- O token de cada vendedor vem de `usuarios.sck`; vazio, usa o primeiro
-- nome. "Casa" fica SEM sck — link sem dono não pode carregar o rastreio
-- de quem por acaso estava na URL copiada.
-- ═════════════════════════════════════════════════════════════════════════

-- ── 1. O catálogo de referência ─────────────────────────────────────────

create or replace function public.catalogo_mestre()
returns table (oferta text, valor numeric, condicao text, url text)
language sql stable security definer set search_path = public as $$
  with fonte as (
    select evento_id
    from public.links
    group by evento_id
    order by count(distinct oferta) desc
    limit 1
  )
  -- distinct on: uma linha por oferta, qualquer vendedor serve — a URL é a
  -- mesma; o sck é removido e recolocado por vendedor na hora de semear.
  select distinct on (l.oferta)
    l.oferta,
    l.valor,
    l.condicao,
    regexp_replace(regexp_replace(l.url, '[?&]sck=[^&]*', ''), '\?&', '?') as url
  from public.links l
  join fonte f on f.evento_id = l.evento_id
  order by l.oferta, l.vendedor_nome;
$$;

comment on function public.catalogo_mestre is
  'Ofertas distintas do evento mais completo, com a URL limpa de sck. Base para semear eventos e vendedores novos.';

-- ── 2. Semear um evento ─────────────────────────────────────────────────

create or replace function public.semear_links_do_evento(p_evento_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  insert into public.links (evento_id, vendedor_nome, sck, status, oferta, valor, condicao, url)
  select
    p_evento_id,
    v.nome,
    v.sck,
    'new',
    c.oferta,
    c.valor,
    c.condicao,
    case when v.sck is null then c.url
         else c.url || case when c.url like '%?%' then '&' else '?' end || 'sck=' || v.sck end
  from public.catalogo_mestre() c
  cross join (
    select 'Casa'::text as nome, null::text as sck
    union all
    select u.nome, coalesce(nullif(trim(u.sck), ''), split_part(trim(u.nome), ' ', 1))
    from public.usuarios u
    where u.ativo and u.papel in ('admin', 'gestor', 'closer')
  ) v
  on conflict (evento_id, oferta, vendedor_nome) do nothing;

  get diagnostics n = row_count;
  return n;
end $$;

comment on function public.semear_links_do_evento is
  'Cria o catálogo inteiro para um evento, para Casa e todos os vendedores ativos. Não toca em link que já existe.';

-- ── 3. Semear um vendedor em todos os eventos ───────────────────────────

create or replace function public.semear_links_do_vendedor(p_usuario_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_nome text;
  v_sck  text;
  n integer;
begin
  select u.nome, coalesce(nullif(trim(u.sck), ''), split_part(trim(u.nome), ' ', 1))
    into v_nome, v_sck
  from public.usuarios u
  where u.id = p_usuario_id and u.ativo and u.papel in ('admin', 'gestor', 'closer');

  if v_nome is null then return 0; end if;

  insert into public.links (evento_id, vendedor_nome, sck, status, oferta, valor, condicao, url)
  select e.id, v_nome, v_sck, 'new', c.oferta, c.valor, c.condicao,
         c.url || case when c.url like '%?%' then '&' else '?' end || 'sck=' || v_sck
  from public.eventos e
  cross join public.catalogo_mestre() c
  on conflict (evento_id, oferta, vendedor_nome) do nothing;

  get diagnostics n = row_count;
  return n;
end $$;

-- ── 4. Gatilhos ─────────────────────────────────────────────────────────

create or replace function public.ao_criar_evento_semear_links()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.semear_links_do_evento(new.id);
  return new;
end $$;

drop trigger if exists eventos_semear_links on public.eventos;
create trigger eventos_semear_links
  after insert on public.eventos
  for each row execute function public.ao_criar_evento_semear_links();

create or replace function public.ao_criar_usuario_semear_links()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.semear_links_do_vendedor(new.id);
  return new;
end $$;

drop trigger if exists usuarios_semear_links on public.usuarios;
create trigger usuarios_semear_links
  after insert on public.usuarios
  for each row execute function public.ao_criar_usuario_semear_links();

-- ── 5. Preencher o que já existe ────────────────────────────────────────
-- Roda uma vez, agora: todo evento que estiver sem o catálogo completo
-- (inclusive o que você acabou de criar) recebe os links.

do $$
declare
  ev record;
  total integer := 0;
  n integer;
begin
  for ev in select id, nome from public.eventos loop
    n := public.semear_links_do_evento(ev.id);
    total := total + n;
    raise notice 'Evento "%": % links criados.', ev.nome, n;
  end loop;
  raise notice 'Total: % links.', total;
end $$;

-- Conferência: links por evento e vendedor
select e.nome as evento, l.vendedor_nome, count(*) as links
from public.links l
join public.eventos e on e.id = l.evento_id
group by e.nome, l.vendedor_nome
order by e.nome, l.vendedor_nome;
