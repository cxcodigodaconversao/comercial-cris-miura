// ─────────────────────────────────────────────────────────────────────────
// Cria UM usuário pela linha de comando.
//
// O caminho normal é a tela (Gerir usuários > Cadastrar). Este script existe
// para quando a tela não serve: o app ainda não publicado, ou o papel novo
// que só existe no código.
//
// Uso:
//   node scripts/criar-usuario.mjs <email> "<Nome>" <papel> [sck]
//   node scripts/criar-usuario.mjs promotor@crismiura.com.br "Promotor" promotor
//
// Papéis: admin | gestor | closer | promotor
// ─────────────────────────────────────────────────────────────────────────

import { readFileSync, existsSync } from "node:fs";
import { randomInt } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const [emailBruto, nome, papel, sck] = process.argv.slice(2);
const PAPEIS = ["admin", "gestor", "closer", "promotor"];

if (!emailBruto || !nome || !papel) {
  console.error('uso: node scripts/criar-usuario.mjs <email> "<Nome>" <papel> [sck]');
  console.error(`papéis: ${PAPEIS.join(" | ")}`);
  process.exit(1);
}
if (!PAPEIS.includes(papel)) {
  console.error(`Papel inválido: "${papel}". Use um de: ${PAPEIS.join(", ")}`);
  process.exit(1);
}

const email = emailBruto.trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error(`E-mail inválido: ${email}`);
  process.exit(1);
}

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const envLocal = join(raiz, ".env.local");
if (existsSync(envLocal)) {
  for (const linha of readFileSync(envLocal, "utf8").split("\n")) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const CHAVE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !CHAVE) {
  console.error("Faltam NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (.env.local).");
  process.exit(1);
}
const sb = createClient(URL, CHAVE, { auth: { persistSession: false } });

/** Sem caracteres ambíguos (0/O, 1/l/I): costuma ser ditada por telefone. */
function senhaTemporaria() {
  const letras = "ABCDEFGHJKMNPQRSTUVWXYZ";
  const numeros = "23456789";
  const bloco = (fonte, n) =>
    Array.from({ length: n }, () => fonte[randomInt(fonte.length)]).join("");
  return `Ava-${bloco(letras, 3)}${bloco(numeros, 4)}`;
}

const senha = senhaTemporaria();

const { data: conta, error: erroAuth } = await sb.auth.admin.createUser({
  email,
  password: senha,
  email_confirm: true,
  user_metadata: { nome },
});
if (erroAuth) {
  console.error("❌", erroAuth.message.includes("already")
    ? "Já existe um usuário com este e-mail."
    : erroAuth.message);
  process.exit(1);
}

const { error: erroPerfil } = await sb.from("usuarios").insert({
  id: conta.user.id,
  email,
  nome,
  papel,
  ativo: true,
  precisa_trocar_senha: true,
  sck: sck ?? null,
  criado_por: "script:criar-usuario",
});
if (erroPerfil) {
  // Conta sem perfil é fantasma que ainda bloqueia o e-mail. Desfaz.
  await sb.auth.admin.deleteUser(conta.user.id).catch(() => {});
  console.error("❌", erroPerfil.message);
  process.exit(1);
}

console.log(`
┌──────────────────────────────────────────────┐
│  USUÁRIO CRIADO                              │
└──────────────────────────────────────────────┘

  ${nome}
  login:  ${email}
  papel:  ${papel}
  senha:  ${senha}
${sck ? `  sck:    ${sck}\n` : ""}
  · No primeiro acesso o app exige criar uma senha própria.
  · A senha não fica guardada: se perder, gere outra com
    node scripts/resetar-senha.mjs ${email}
`);
