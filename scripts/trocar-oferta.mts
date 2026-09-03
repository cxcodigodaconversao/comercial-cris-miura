// ─────────────────────────────────────────────────────────────────────────
// Corrige o código de uma oferta cadastrada errada, para TODOS os vendedores
// do evento de uma vez.
//
// Uma oferta errada não é problema de um vendedor: o catálogo é o mesmo para
// todo mundo, então o link errado está com o time inteiro. Corrigir de um em
// um deixaria metade mandando o cliente para a oferta antiga.
//
// O `sck` de cada um é preservado — muda só para onde o cliente é levado.
//
// Uso:
//   npx tsx scripts/trocar-oferta.mts <slug-evento> <oferta-antiga> <oferta-nova>
//   npx tsx scripts/trocar-oferta.mts ima-bh-2026 11u3z90z xvgsr15c --apply
// ─────────────────────────────────────────────────────────────────────────

import { conectar } from "./db.mjs";
import { lerSck, trocarOferta } from "../src/lib/links";

const args = process.argv.slice(2);
const APLICAR = args.includes("--apply");
const [slug, antiga, nova] = args.filter((a) => !a.startsWith("--"));

if (!slug || !antiga || !nova) {
  console.error("uso: npx tsx scripts/trocar-oferta.mts <slug-evento> <oferta-antiga> <oferta-nova> [--apply]");
  process.exit(1);
}

const c = conectar();
await c.connect();

try {
  const { rows: ev } = await c.query(`select id, nome, status::text from public.eventos where slug = $1`, [slug]);
  if (!ev.length) throw new Error(`Evento "${slug}" não existe.`);

  const { rows: alvo } = await c.query(
    `select id, vendedor_nome, sck, valor, condicao, url
       from public.links where evento_id = $1 and oferta = $2 order by vendedor_nome`,
    [ev[0].id, antiga]
  );
  if (!alvo.length) throw new Error(`Nenhum link com a oferta "${antiga}" neste evento.`);

  // A oferta nova não pode já existir: a chave é (evento, oferta, vendedor),
  // e o update esbarraria nela.
  const { rows: [{ n }] } = await c.query(
    `select count(*)::int n from public.links where evento_id = $1 and oferta = $2`,
    [ev[0].id, nova]
  );
  if (n > 0) throw new Error(`A oferta "${nova}" já existe neste evento em ${n} link(s). Resolva antes.`);

  console.log(APLICAR ? "MODO: APLICANDO\n" : "MODO: SIMULAÇÃO (use --apply para gravar)\n");
  console.log(`  evento: ${ev[0].nome}  [${ev[0].status}]`);
  console.log(`  oferta: ${antiga}  →  ${nova}`);
  console.log(`  links:  ${alvo.length}\n`);
  console.log(`  ${alvo[0].condicao} · R$ ${alvo[0].valor}\n`);

  console.table(
    alvo.slice(0, 3).map((l) => ({
      vendedor: l.vendedor_nome.slice(0, 24),
      antes: l.url,
      depois: trocarOferta(l.url, nova),
    }))
  );

  if (!APLICAR) {
    console.log("\nNada foi gravado. Rode de novo com --apply.");
    process.exit(0);
  }

  await c.query("begin");
  for (const l of alvo) {
    await c.query(`update public.links set oferta = $2, url = $3 where id = $1`, [
      l.id,
      nova,
      trocarOferta(l.url, nova),
    ]);
  }

  const { rows: depois } = await c.query(
    `select vendedor_nome, sck, url from public.links
      where evento_id = $1 and oferta = $2 order by vendedor_nome`,
    [ev[0].id, nova]
  );

  // Nenhum sck pode ter se perdido no caminho — é ele que paga a comissão.
  const perdidos = depois.filter((l) => {
    const naUrl = lerSck(l.url);
    return l.sck ? (naUrl ?? "").toLowerCase() !== l.sck.toLowerCase() : naUrl !== null;
  });

  await c.query("commit");

  console.log(`\n✓ ${depois.length} links atualizados para a oferta ${nova}.`);
  console.log(
    perdidos.length
      ? `⚠️  ${perdidos.length} link(s) com o token trocado: ${perdidos.map((p) => p.vendedor_nome).join(", ")}`
      : "✓ todos mantiveram o próprio token de rastreio"
  );
} catch (e) {
  await c.query("rollback").catch(() => {});
  console.error("\n❌ FALHOU:", (e as Error).message);
  process.exitCode = 1;
} finally {
  await c.end();
}
