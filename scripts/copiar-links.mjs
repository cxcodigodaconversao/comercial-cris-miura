// ─────────────────────────────────────────────────────────────────────────
// Copia os links de pagamento de um evento para outro.
//
// As ofertas da Hotmart pertencem ao PRODUTO, não à edição do evento: o
// mesmo link vale em duas edições do evento. Mas a tabela é escopada por evento
// (cada edição pode ter seu próprio conjunto), então o time só enxerga os
// links do evento selecionado — daí a cópia.
//
// Uso:
//   node scripts/copiar-links.mjs <slug-origem> <slug-destino>
//   node scripts/copiar-links.mjs ima-bh-2026 ima-bh-2026 --apply
//
// IDEMPOTENTE: a chave é (evento, oferta, vendedor). Rodar de novo atualiza
// em vez de duplicar.
// ─────────────────────────────────────────────────────────────────────────

import { conectar } from "./db.mjs";

const [origemSlug, destinoSlug] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const APLICAR = process.argv.includes("--apply");

if (!origemSlug || !destinoSlug) {
  console.error("uso: node scripts/copiar-links.mjs <slug-origem> <slug-destino> [--apply]");
  process.exit(1);
}

const c = conectar();
await c.connect();

try {
  const { rows: eventos } = await c.query(
    `select id, slug, nome, status::text from public.eventos where slug = any($1)`,
    [[origemSlug, destinoSlug]]
  );
  const origem = eventos.find((e) => e.slug === origemSlug);
  const destino = eventos.find((e) => e.slug === destinoSlug);

  if (!origem) throw new Error(`Evento de origem "${origemSlug}" não existe.`);
  if (!destino) throw new Error(`Evento de destino "${destinoSlug}" não existe.`);
  if (origem.id === destino.id) throw new Error("Origem e destino são o mesmo evento.");

  console.log(APLICAR ? "MODO: APLICANDO\n" : "MODO: SIMULAÇÃO (use --apply para gravar)\n");
  console.log(`  de:   ${origem.nome}  [${origem.status}]`);
  console.log(`  para: ${destino.nome}  [${destino.status}]\n`);

  const { rows: resumo } = await c.query(
    `select vendedor_nome, coalesce(sck,'') sck, count(*)::int qtd
       from public.links where evento_id = $1
      group by 1,2 order by 1`,
    [origem.id]
  );
  if (!resumo.length) throw new Error("O evento de origem não tem link nenhum.");

  const { rows: [{ ja }] } = await c.query(
    `select count(*)::int ja from public.links where evento_id = $1`,
    [destino.id]
  );

  console.table(resumo);
  const total = resumo.reduce((a, r) => a + r.qtd, 0);
  console.log(`total na origem: ${total} · já existentes no destino: ${ja}`);

  if (!APLICAR) {
    console.log("\nNada foi gravado. Rode de novo com --apply.");
    process.exit(0);
  }

  await c.query("begin");

  // As URLs são copiadas COMO ESTÃO: o `sck` dentro delas é o que rastreia
  // a comissão do vendedor na Hotmart, e reescrever qualquer parte disso
  // quebraria o rastreio da venda.
  const r = await c.query(
    `insert into public.links (evento_id, vendedor_nome, sck, status, oferta, valor, condicao, url)
     select $2, vendedor_nome, sck, status, oferta, valor, condicao, url
       from public.links
      where evento_id = $1
     on conflict (evento_id, oferta, vendedor_nome) do update set
       sck = excluded.sck, status = excluded.status,
       valor = excluded.valor, condicao = excluded.condicao, url = excluded.url`,
    [origem.id, destino.id]
  );

  const { rows: [conf] } = await c.query(
    `select count(*)::int total, count(distinct vendedor_nome)::int vendedores
       from public.links where evento_id = $1`,
    [destino.id]
  );

  await c.query("commit");

  console.log(`\n✓ ${r.rowCount} links processados.`);
  console.log(`  no destino agora: ${conf.total} links de ${conf.vendedores} vendedores`);
} catch (e) {
  await c.query("rollback").catch(() => {});
  console.error("\n❌ FALHOU:", e.message);
  process.exitCode = 1;
} finally {
  await c.end();
}
