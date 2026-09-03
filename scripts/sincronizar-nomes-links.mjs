// ─────────────────────────────────────────────────────────────────────────
// Alinha `links.vendedor_nome` ao nome cadastrado da pessoa, casando pelo
// `sck`.
//
// Por que existe: `vendedor_nome` é só um RÓTULO — quem liga a venda à
// comissão é o `sck` dentro da URL, que este script não toca. O rótulo
// vinha do arquivo da Hotmart com apelido ("Mila") enquanto o cadastro tem
// o nome completo ("Mila Pinheiro Simões Mota"), e essa diferença deixava a
// pessoa sem enxergar os próprios links.
//
// Uso:
//   node scripts/sincronizar-nomes-links.mjs             # simulação
//   node scripts/sincronizar-nomes-links.mjs --apply
//
// Idempotente: rodar de novo não muda nada depois do primeiro apply.
// ─────────────────────────────────────────────────────────────────────────

import { conectar } from "./db.mjs";

const APLICAR = process.argv.includes("--apply");
const c = conectar();
await c.connect();

try {
  console.log(APLICAR ? "MODO: APLICANDO\n" : "MODO: SIMULAÇÃO (use --apply para gravar)\n");

  const { rows: pendentes } = await c.query(`
    select e.nome as evento, l.vendedor_nome as de, u.nome as para,
           lower(l.sck) as sck, count(*)::int as links
      from public.links l
      join public.usuarios u on lower(u.sck) = lower(l.sck)
      join public.eventos e on e.id = l.evento_id
     where l.sck is not null and l.sck <> ''
       and l.vendedor_nome is distinct from u.nome
     group by 1,2,3,4
     order by 1,3
  `);

  if (!pendentes.length) {
    console.log("Nada a fazer: todos os rótulos já batem com o cadastro.");
    process.exit(0);
  }

  console.table(pendentes);

  // Um sck que casasse com duas pessoas geraria renomeação alternada e
  // instável — é sintoma de cadastro duplicado, não algo para "resolver" aqui.
  const { rows: ambiguos } = await c.query(`
    select lower(sck) sck, count(*)::int quantos, string_agg(nome, ' | ') pessoas
      from public.usuarios where sck is not null and sck <> ''
     group by 1 having count(*) > 1
  `);
  if (ambiguos.length) {
    console.error("\n❌ ABORTADO: há sck repetido entre usuários diferentes.");
    console.table(ambiguos);
    console.error("Corrija o cadastro antes — senão o rótulo ficaria oscilando.");
    process.exit(1);
  }

  if (!APLICAR) {
    console.log("\nNada foi gravado. Rode de novo com --apply.");
    process.exit(0);
  }

  await c.query("begin");
  const r = await c.query(`
    update public.links l
       set vendedor_nome = u.nome
      from public.usuarios u
     where lower(u.sck) = lower(l.sck)
       and l.sck is not null and l.sck <> ''
       and l.vendedor_nome is distinct from u.nome
  `);
  await c.query("commit");

  console.log(`\n✓ ${r.rowCount} links renomeados. As URLs e os sck ficaram intactos.`);

  const { rows: conf } = await c.query(`
    select u.nome, coalesce(u.sck,'—') sck,
           (select count(*) from public.links l
             where l.evento_id = e.id and l.vendedor_nome = u.nome)::int por_nome
      from public.usuarios u
     cross join (select id from public.eventos where status='ativo'
                  order by data_inicio desc limit 1) e
     where u.sck is not null and u.sck <> ''
     order by u.nome
  `);
  console.log("\nNo evento ativo, agora casando por nome:");
  console.table(conf);
} catch (e) {
  await c.query("rollback").catch(() => {});
  console.error("\n❌ FALHOU:", e.message);
  process.exitCode = 1;
} finally {
  await c.end();
}
