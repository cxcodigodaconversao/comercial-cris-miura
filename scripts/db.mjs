// Conexão com o Postgres do Supabase para os scripts de manutenção.
//
// A senha NUNCA fica no código: vem de SUPABASE_DB_URL ou da dupla
// SUPABASE_DB_HOST + SUPABASE_DB_PASSWORD (veja .env.local.example).
//
// Uso nos scripts:  import { conectar } from "./db.mjs";

import pg from "pg";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Lê .env.local sem depender de dotenv (é o único uso que os scripts fazem). */
function carregarEnvLocal() {
  const arquivo = join(raiz, ".env.local");
  if (!existsSync(arquivo)) return;
  for (const linha of readFileSync(arquivo, "utf8").split("\n")) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const valor = m[2].replace(/^["']|["']$/g, "");
    if (!process.env[m[1]]) process.env[m[1]] = valor;
  }
}

export function conectar() {
  carregarEnvLocal();

  const url = process.env.SUPABASE_DB_URL;
  const senha = process.env.SUPABASE_DB_PASSWORD;
  const host = process.env.SUPABASE_DB_HOST;

  if (!url && !(senha && host)) {
    console.error(
      "Faltam credenciais do banco.\n" +
        "  Defina SUPABASE_DB_URL, ou SUPABASE_DB_HOST + SUPABASE_DB_PASSWORD,\n" +
        "  no .env.local (que está no .gitignore) ou no ambiente."
    );
    process.exit(1);
  }

  // Config em objeto quando possível: senha com caracteres como "*" e "@"
  // quebra o parsing de connection string em alguns drivers.
  return new pg.Client(
    url
      ? { connectionString: url, ssl: { rejectUnauthorized: false } }
      : {
          host,
          port: Number(process.env.SUPABASE_DB_PORT || 5432),
          user: process.env.SUPABASE_DB_USER || "postgres",
          password: senha,
          database: process.env.SUPABASE_DB_NAME || "postgres",
          ssl: { rejectUnauthorized: false },
          statement_timeout: 120000,
        }
  );
}
