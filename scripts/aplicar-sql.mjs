// Aplica um arquivo .sql no banco, em transação única.
// Uso:  node scripts/aplicar-sql.mjs supabase/migrations/0001_esquema_inicial.sql

import { readFileSync } from "node:fs";
import { conectar } from "./db.mjs";

const arquivo = process.argv[2];
if (!arquivo) {
  console.error("uso: node scripts/aplicar-sql.mjs <caminho.sql>");
  process.exit(1);
}

const sql = readFileSync(arquivo, "utf8");

// `ALTER TYPE ... ADD VALUE` até roda dentro de transação no PG 12+, mas o
// valor novo não pode ser USADO na mesma transação — e uma função que o
// referencia falha na validação do corpo. Migração com esse caso declara
// `-- @sem-transacao` no topo e roda solta.
const SEM_TRANSACAO = /^\s*--\s*@sem-transacao\b/m.test(sql);

const c = conectar();
await c.connect();
try {
  if (SEM_TRANSACAO) {
    console.log("  (arquivo marcado @sem-transacao — sem rollback automático)");
    await c.query(sql);
  } else {
    // Tudo numa transação: ou o esquema inteiro entra, ou nada entra.
    await c.query("begin");
    await c.query(sql);
    await c.query("commit");
  }
  console.log("✓ aplicado:", arquivo);
} catch (e) {
  if (!SEM_TRANSACAO) await c.query("rollback").catch(() => {});
  console.error(SEM_TRANSACAO ? "✗ FALHOU (SEM rollback — confira o estado)" : "✗ FALHOU (rollback feito)");
  console.error("  ", e.message);
  if (e.position) {
    const pos = Number(e.position);
    console.error("   contexto:", JSON.stringify(sql.slice(Math.max(0, pos - 160), pos + 160)));
  }
  process.exitCode = 1;
} finally {
  await c.end();
}
