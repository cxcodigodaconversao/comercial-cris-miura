// ─────────────────────────────────────────────────────────────────────────
// Gera o catálogo de links de um vendedor copiando o de outro, trocando o
// token de rastreio. É a versão de linha de comando do "Gerar para alguém"
// da tela — e usa a MESMA função de troca (src/lib/links.ts), para não
// existirem duas implementações de algo que decide comissão.
//
// Uso (precisa de tsx, já em devDependencies):
//   npx tsx scripts/gerar-links-vendedor.ts <slug-evento> "<modelo>" "<destino>" <sck>
//   npx tsx scripts/gerar-links-vendedor.ts ima-bh-2026 "Nome do Vendedor" "Promotor" IMA_BH --apply
//
// Idempotente: a chave é (evento, oferta, vendedor).
// ─────────────────────────────────────────────────────────────────────────

import { conectar } from "./db.mjs";
import { trocarSck, validarSck } from "../src/lib/links";

const args = process.argv.slice(2);
const APLICAR = args.includes("--apply");
const [slug, modelo, destino, sck] = args.filter((a) => !a.startsWith("--"));

if (!slug || !modelo || !destino || !sck) {
  console.error(
    'uso: npx tsx scripts/gerar-links-vendedor.ts <slug-evento> "<modelo>" "<destino>" <sck> [--apply]'
  );
  process.exit(1);
}

const erroSck = validarSck(sck);
if (erroSck) {
  console.error(`Token inválido: ${erroSck}`);
  process.exit(1);
}

const c = conectar();
await c.connect();

try {
  const { rows: ev } = await c.query(`select id, nome from public.eventos where slug = $1`, [slug]);
  if (!ev.length) throw new Error(`Evento "${slug}" não existe.`);

  const { rows: base } = await c.query(
    `select oferta, valor, condicao, url from public.links
      where evento_id = $1 and vendedor_nome = $2 order by valor desc nulls last`,
    [ev[0].id, modelo]
  );
  if (!base.length) throw new Error(`"${modelo}" não tem links neste evento.`);

  const { rows: jaTem } = await c.query(
    `select count(*)::int n from public.links where evento_id = $1 and vendedor_nome = $2`,
    [ev[0].id, destino]
  );

  console.log(APLICAR ? "MODO: APLICANDO\n" : "MODO: SIMULAÇÃO (use --apply para gravar)\n");
  console.log(`  evento:  ${ev[0].nome}`);
  console.log(`  modelo:  ${modelo} (${base.length} links)`);
  console.log(`  destino: ${destino} (tem ${jaTem[0].n} hoje)`);
  console.log(`  token:   ${sck}\n`);

  console.log("Amostra do que será criado:");
  console.table(
    base.slice(0, 3).map((l) => ({
      valor: l.valor,
      condicao: l.condicao,
      url: trocarSck(l.url, sck),
    }))
  );

  if (!APLICAR) {
    console.log("\nNada foi gravado. Rode de novo com --apply.");
    process.exit(0);
  }

  await c.query("begin");
  for (const l of base) {
    await c.query(
      `insert into public.links (evento_id, vendedor_nome, sck, status, oferta, valor, condicao, url)
       values ($1,$2,$3,'new',$4,$5,$6,$7)
       on conflict (evento_id, oferta, vendedor_nome) do update set
         sck = excluded.sck, valor = excluded.valor,
         condicao = excluded.condicao, url = excluded.url`,
      [ev[0].id, destino, sck, l.oferta, l.valor, l.condicao, trocarSck(l.url, sck)]
    );
  }

  // Sem o token no cadastro, a pessoa continua sem enxergar os próprios
  // links: é o sck que liga uma coisa à outra.
  const { rowCount: cadastroAtualizado } = await c.query(
    `update public.usuarios set sck = $2 where nome = $1`,
    [destino, sck]
  );

  const { rows: conf } = await c.query(
    `select count(*)::int total,
            count(*) filter (where url ilike '%sck=' || $3 || '%')::int com_token
       from public.links where evento_id = $1 and vendedor_nome = $2`,
    [ev[0].id, destino, sck]
  );

  await c.query("commit");

  console.log(`\n✓ ${destino}: ${conf[0].total} links, ${conf[0].com_token} com o token novo.`);
  console.log(
    cadastroAtualizado
      ? `✓ Token gravado no cadastro de ${destino}.`
      : `⚠️  Nenhum usuário chamado "${destino}" — o token não foi para o cadastro, então a aba Links dele ficaria vazia.`
  );
} catch (e) {
  await c.query("rollback").catch(() => {});
  console.error("\n❌ FALHOU:", (e as Error).message);
  process.exitCode = 1;
} finally {
  await c.end();
}
