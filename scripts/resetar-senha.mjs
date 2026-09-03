// ─────────────────────────────────────────────────────────────────────────
// Gera uma senha temporária para um usuário, pela linha de comando.
//
// Existe como SAÍDA DE EMERGÊNCIA: dentro do app, só admin reseta senha —
// então se o único admin perde a dele, ninguém consegue entrar para
// consertar. Este script é o caminho de volta, e depende da service role
// (que só quem tem acesso ao ambiente possui).
//
// No dia a dia, prefira a tela: Gerir usuários > Nova senha.
//
// Uso:
//   node scripts/resetar-senha.mjs pessoa@empresa.com.br
// ─────────────────────────────────────────────────────────────────────────

import { readFileSync, existsSync } from "node:fs";
import { randomInt } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const email = (process.argv[2] || "").trim().toLowerCase();
if (!email) {
  console.error("uso: node scripts/resetar-senha.mjs <email>");
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

const { data: usuario, error: erroBusca } = await sb
  .from("usuarios")
  .select("id, nome, papel, ativo")
  .eq("email", email)
  .maybeSingle();

if (erroBusca) {
  console.error("Erro ao consultar:", erroBusca.message);
  process.exit(1);
}
if (!usuario) {
  console.error(`Não existe usuário com o e-mail "${email}".`);
  process.exit(1);
}

const senha = senhaTemporaria();

const { error: erroSenha } = await sb.auth.admin.updateUserById(usuario.id, { password: senha });
if (erroSenha) {
  console.error("Erro ao trocar a senha:", erroSenha.message);
  process.exit(1);
}

// Marca a troca obrigatória: senha ditada por terceiro não pode continuar
// valendo depois do primeiro acesso.
await sb
  .from("usuarios")
  .update({ precisa_trocar_senha: true, senha_resetada_por: "script:resetar-senha" })
  .eq("id", usuario.id);

// Derruba sessões abertas — senha resetada tem que expulsar quem estiver dentro.
await sb.auth.admin.signOut(usuario.id, "global").catch(() => {});

console.log(`
┌─────────────────────────────────────────────────────┐
│  SENHA TEMPORÁRIA GERADA                            │
└─────────────────────────────────────────────────────┘

  ${usuario.nome}  <${email}>
  papel: ${usuario.papel}${usuario.ativo ? "" : "   ⚠️  CONTA DESATIVADA — não vai conseguir entrar"}

  senha:  ${senha}

  · As sessões abertas foram encerradas.
  · No primeiro acesso o app exige criar uma senha própria.
`);
