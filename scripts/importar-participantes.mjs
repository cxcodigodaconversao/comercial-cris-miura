// ─────────────────────────────────────────────────────────────────────────
// Importa a planilha de participantes pela MESMA rota que a tela usa.
//
// Existe para o caso em que o app ainda não está publicado, ou quando é
// mais prático rodar do terminal. Não duplica regra: chama
// POST /api/leads/importar, então validação, prévia e gravação são
// exatamente as que o admin veria na tela.
//
// Uso:
//   node scripts/importar-participantes.mjs <arquivo.xlsx> <slug-do-evento>
//   node scripts/importar-participantes.mjs planilha.xlsx ima-bh-2026 --apply
//
// Precisa do app rodando (npm run dev) ou de APP_URL apontando para o ar.
// ─────────────────────────────────────────────────────────────────────────

import { readFileSync, existsSync } from "node:fs";
import { basename } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { conectar } from "./db.mjs";

const args = process.argv.slice(2);
const APLICAR = args.includes("--apply");
const [arquivo, slug] = args.filter((a) => !a.startsWith("--"));

if (!arquivo || !slug) {
  console.error("uso: node scripts/importar-participantes.mjs <arquivo.xlsx> <slug-evento> [--apply]");
  process.exit(1);
}
if (!existsSync(arquivo)) {
  console.error(`Arquivo não encontrado: ${arquivo}`);
  process.exit(1);
}

// .env.local
for (const linha of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const APP = process.env.APP_URL || "http://localhost:3011";
const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const c = conectar();
await c.connect();
const { rows: eventos } = await c.query(`select id, nome from public.eventos where slug = $1`, [slug]);
if (!eventos.length) {
  console.error(`Evento "${slug}" não existe.`);
  process.exit(1);
}

// A rota exige um admin de verdade — e é bom que exija. Em vez de abrir
// exceção no servidor para scripts (mais uma porta para manter fechada) ou
// de mexer na senha de alguém real, o script cria um admin DESCARTÁVEL,
// usa, e apaga no fim. Ninguém do time perde acesso por causa de um import.
const sb = createClient(URL_SB, SERVICE, { auth: { persistSession: false } });

// Varre restos de execuções anteriores ANTES de criar mais um. O `finally`
// não roda se o processo for morto (Ctrl+C, pipe quebrado, queda) — e um
// admin esquecido no banco é porta aberta. Já aconteceu.
const { rows: restos } = await c.query(
  `select id, email from public.usuarios where email like 'importador-%@crismiura.local'`
);
for (const r of restos) {
  await sb.auth.admin.deleteUser(r.id).catch(() => {});
  console.log(`  limpou resto de execução anterior: ${r.email}`);
}

const emailTemp = `importador-${Date.now()}@crismiura.local`;
const senhaTemp = `Imp-${crypto.randomUUID()}`;

console.log(`Criando admin temporário (${emailTemp})...`);
const { data: criado, error: erroCriar } = await sb.auth.admin.createUser({
  email: emailTemp,
  password: senhaTemp,
  email_confirm: true,
});
if (erroCriar) {
  console.error("Falha ao criar o admin temporário:", erroCriar.message);
  process.exit(1);
}
await c.query(
  `insert into public.usuarios (id, email, nome, papel, ativo, precisa_trocar_senha, criado_por)
   values ($1,$2,'Importador (temporário)','admin',true,false,'script:importar-participantes')`,
  [criado.user.id, emailTemp]
);

const anon = createClient(URL_SB, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});
const { data: sessao, error: erroLogin } = await anon.auth.signInWithPassword({
  email: emailTemp,
  password: senhaTemp,
});
if (erroLogin) {
  await sb.auth.admin.deleteUser(criado.user.id).catch(() => {});
  console.error("Falha ao autenticar:", erroLogin.message);
  process.exit(1);
}

try {
  const form = new FormData();
  form.append(
    "arquivo",
    new Blob([readFileSync(arquivo)], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    basename(arquivo)
  );
  form.append("eventoId", eventos[0].id);
  if (APLICAR) form.append("confirmar", "sim");

  console.log(`\n${APLICAR ? "IMPORTANDO" : "PRÉVIA"} — ${eventos[0].nome}\n`);

  const res = await fetch(`${APP}/api/leads/importar`, {
    method: "POST",
    headers: { Authorization: `Bearer ${sessao.session.access_token}` },
    body: form,
  });
  const dados = await res.json();

  if (!res.ok) {
    console.error("❌", dados.error);
    process.exitCode = 1;
  } else {
    const r = dados.resumo;
    console.table({
      "linhas na planilha": r.linhasNaPlanilha,
      importáveis: r.importaveis,
      novos: r.novos,
      atualizados: r.atualizados,
      ignoradas: r.ignoradas,
      ...(r.gravados !== undefined ? { GRAVADOS: r.gravados } : {}),
    });
    if (r.exemplosIgnorados?.length) {
      console.log("Exemplos de linhas ignoradas:");
      r.exemplosIgnorados.forEach((i) => console.log(`  linha ${i.linha} · ${i.nome} — ${i.motivo}`));
    }
    if (r.colunasDesconhecidas?.length) {
      console.log(`\nColunas não usadas: ${r.colunasDesconhecidas.join(", ")}`);
    }
    if (!APLICAR) console.log("\nNada foi gravado. Rode de novo com --apply.");
  }
} finally {
  // O admin temporário some sempre — inclusive se a importação falhar.
  // Conta admin esquecida no banco é porta aberta.
  const { error } = await sb.auth.admin.deleteUser(criado.user.id);
  console.log(error ? `\n⚠️  NÃO consegui apagar ${emailTemp}: ${error.message}` : "\n✓ Admin temporário removido.");
  await c.end();
}
