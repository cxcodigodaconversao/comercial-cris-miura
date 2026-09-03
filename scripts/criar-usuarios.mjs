// ─────────────────────────────────────────────────────────────────────────
// Cria no Supabase os acessos da equipe que existia na v1 (o antigo
// EMAIL_MAP de src/lib/config.ts, que era código-fonte).
//
// As senhas do Firebase NÃO viajam: o hash é dele. Todo mundo recebe uma
// senha temporária nova e é obrigado a trocar no primeiro acesso.
//
// Uso:
//   node scripts/criar-usuarios.mjs                 # simulação
//   node scripts/criar-usuarios.mjs --apply
//   node scripts/criar-usuarios.mjs --apply --so dsgnelias@gmail.com
//
// IDEMPOTENTE: quem já existe é pulado (a senha atual dele não é mexida).
// ─────────────────────────────────────────────────────────────────────────

import { readFileSync, existsSync } from "node:fs";
import { randomInt } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const APLICAR = process.argv.includes("--apply");
const idxSo = process.argv.indexOf("--so");
const SO = idxSo > -1 ? process.argv[idxSo + 1]?.toLowerCase() : null;

// ── Ambiente ────────────────────────────────────────────────────────────
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

// ── Equipe da v1 ────────────────────────────────────────────────────────
// Cópia literal do EMAIL_MAP no commit 6081c38. `adm: true` vira papel
// "admin"; o resto vira "closer" — quem for gestor, o admin ajusta na tela.
const EQUIPE = [
  { email: "dsgnelias@gmail.com", nome: "Elias", papel: "admin" },
  { email: "everton@comercial10x.com.br", nome: "Everton", papel: "admin", sck: "Everton" },
  { email: "jezreel@comercial10x.com.br", nome: "Jezreel", papel: "admin", sck: "Jez" },
  { email: "everton@comercial10x.com.br", nome: "Everton", papel: "admin", sck: "Everton" },
  { email: "willysc7@gmail.com", nome: "Willy", papel: "closer", sck: "Willy" },
  { email: "comercial1@comercial10x.com.br", nome: "Renato", papel: "closer", sck: "Renato" },
  { email: "especialista1@comercial10x.com.br", nome: "Bruna", papel: "closer", sck: "Bruna" },
  { email: "especialista2@comercial10x.com.br", nome: "Gabriel Jesus", papel: "closer", sck: "GabrielJesus" },
  { email: "especialista5@comercial10x.com.br", nome: "Gabriel Aduati", papel: "closer", sck: "GabrielAduati" },
  { email: "especialista3@comercial10x.com.br", nome: "Mila", papel: "closer", sck: "Mila" },
  { email: "especialista4@comercial10x.com.br", nome: "Rodrigo", papel: "closer", sck: "Rodrigo" },
  { email: "a.caroline2396@gmail.com", nome: "Ani Caroline", papel: "closer", sck: "Ani" },
  { email: "especialista6@comercial10x.com.br", nome: "Ana Luiza", papel: "closer", sck: "Ana" },
];

/** Sem caracteres ambíguos (0/O, 1/l/I): vai ser ditada por telefone. */
function senhaTemporaria() {
  const letras = "ABCDEFGHJKMNPQRSTUVWXYZ";
  const numeros = "23456789";
  const bloco = (fonte, n) =>
    Array.from({ length: n }, () => fonte[randomInt(fonte.length)]).join("");
  return `Ava-${bloco(letras, 3)}${bloco(numeros, 4)}`;
}

const alvo = SO ? EQUIPE.filter((p) => p.email === SO) : EQUIPE;
if (!alvo.length) {
  console.error(`Ninguém com o e-mail "${SO}" na lista.`);
  process.exit(1);
}

console.log(APLICAR ? "MODO: APLICANDO\n" : "MODO: SIMULAÇÃO (use --apply para criar)\n");

const { data: existentes } = await sb.from("usuarios").select("email");
const jaExiste = new Set((existentes ?? []).map((u) => u.email));

const criar = alvo.filter((p) => !jaExiste.has(p.email));
const pular = alvo.filter((p) => jaExiste.has(p.email));

console.log(`A CRIAR (${criar.length}):`);
criar.forEach((p) => console.log(`  ${p.email.padEnd(36)} ${p.nome.padEnd(16)} ${p.papel}`));
if (pular.length) {
  console.log(`\nJÁ EXISTEM — não serão tocados (${pular.length}):`);
  pular.forEach((p) => console.log(`  ${p.email}`));
}

if (!APLICAR) {
  console.log("\nNada foi criado. Rode de novo com --apply.");
  process.exit(0);
}
if (!criar.length) {
  console.log("\nNada a fazer.");
  process.exit(0);
}

console.log("\nCriando...\n");
const senhas = [];

for (const p of criar) {
  const senha = senhaTemporaria();

  const { data: conta, error: erroAuth } = await sb.auth.admin.createUser({
    email: p.email,
    password: senha,
    // Não há envio de e-mail configurado: sem confirmar aqui, a pessoa não
    // conseguiria entrar e ficaria esperando uma mensagem que nunca chega.
    email_confirm: true,
    user_metadata: { nome: p.nome },
  });

  if (erroAuth) {
    console.log(`  ✗ ${p.email}: ${erroAuth.message}`);
    continue;
  }

  const { error: erroPerfil } = await sb.from("usuarios").insert({
    id: conta.user.id,
    email: p.email,
    nome: p.nome,
    papel: p.papel,
    ativo: true,
    precisa_trocar_senha: true,
    sck: p.sck ?? null,
    criado_por: "migracao-v1",
  });

  if (erroPerfil) {
    // Conta sem perfil é um fantasma que ainda bloqueia o e-mail. Desfaz.
    await sb.auth.admin.deleteUser(conta.user.id).catch(() => {});
    console.log(`  ✗ ${p.email}: ${erroPerfil.message}`);
    continue;
  }

  senhas.push({ nome: p.nome, email: p.email, papel: p.papel, senha });
  console.log(`  ✓ ${p.email.padEnd(36)} ${p.papel}`);
}

console.log("\n" + "═".repeat(72));
console.log("SENHAS TEMPORÁRIAS — anote agora, não dá para consultar depois.");
console.log("Cada pessoa é obrigada a trocar no primeiro acesso.");
console.log("═".repeat(72));
console.table(senhas);
console.log(
  "\nSe alguém perder a senha, o admin gera outra em Gerir usuários > Nova senha.\n" +
    "Quem não faz mais parte do time: desative pela mesma tela (as vendas ficam)."
);
