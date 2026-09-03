// ─────────────────────────────────────────────────────────────────────────
// Cadastra o time comercial a partir da lista abaixo.
//
// Fonte: "Time Comercial 10X - Nomes e Emails" (14/08/2026), que substitui
// o EMAIL_MAP da v1 — o time mudou e alguns e-mails trocaram de dono.
//
// Cada pessoa recebe senha temporária e é obrigada a trocar no 1º acesso.
//
// Uso:
//   node scripts/cadastrar-time.mjs                # simulação + conferência
//   node scripts/cadastrar-time.mjs --apply
//
// IDEMPOTENTE: quem já existe é pulado, sem tocar na senha atual.
// ─────────────────────────────────────────────────────────────────────────

import { readFileSync, existsSync } from "node:fs";
import { randomInt } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { conectar } from "./db.mjs";

const APLICAR = process.argv.includes("--apply");

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

// ─────────────────────────────────────────────────────────────────────────
// O time.
//
// `papel` é 'closer' para todo mundo de propósito: é o mínimo que permite
// trabalhar (registrar e ver as próprias vendas). Promover a gestor libera
// ver o faturamento inteiro do evento — decisão de quem gere, não de um
// cargo escrito num documento. Ajuste na tela de usuários.
//
// `sck` é o token de rastreio da Hotmart e é o que liga a pessoa aos links
// dela. Sem ele, a aba Links aparece vazia.
// ─────────────────────────────────────────────────────────────────────────
const TIME = [
  { nome: "Gabriel Jesus", cargo: "Closer", email: "especialista2@comercial10x.com.br", sck: "gabrieljesus" },
  { nome: "Rodrigo Zucaratto", cargo: "Closer", email: "especialista4@comercial10x.com.br", sck: "rodrigo" },
  { nome: "Ani Caroline", cargo: "SDR", email: "a.caroline2396@gmail.com", sck: "ani" },
  { nome: "Renato André Martins Cardoso", cargo: "Líder Comercial", email: "comercial1@comercial10x.com.br", sck: "renato" },
  { nome: "Bruna Abreu Valadares", cargo: "Closer", email: "especialista1@comercial10x.com.br", sck: "bruna" },
  { nome: "Mila Pinheiro Simões Mota", cargo: "Closer", email: "especialista3@comercial10x.com.br", sck: "mila" },
  { nome: "Ana Paula Rodrigues Galvão", cargo: "SDR", email: "anapaulargalvao@gmail.com", sck: null },
  { nome: "Gabriel Augusto Fuchs Aduati", cargo: "Líder Comercial", email: "especialista5@comercial10x.com.br", sck: "gabrieladuati" },
  { nome: "Michael Iki Herald's Bezerra da Costa", cargo: "Closer", email: "especialista9@comercial10x.com.br", sck: null },
  { nome: "Otávio Henrique Ribeiro", cargo: "SDR", email: "otavio.ribeiro@hotmail.com", sck: null },
  { nome: "Melissa Freitas de Lima", cargo: "SDR", email: "melissacastelodigital@gmail.com", sck: null },
  { nome: "Marlon Lennon da Fonseca Borges", cargo: "Closer", email: "especialista6@comercial10x.com.br", sck: null },
  { nome: "Amanda Grande Ribeiro dos Santos", cargo: "Closer", email: "especialista8@comercial10x.com.br", sck: null },
];

/** Sem caracteres ambíguos (0/O, 1/l/I): vai ser ditada por telefone. */
function senhaTemporaria() {
  const letras = "ABCDEFGHJKMNPQRSTUVWXYZ";
  const numeros = "23456789";
  const bloco = (fonte, n) =>
    Array.from({ length: n }, () => fonte[randomInt(fonte.length)]).join("");
  return `Ava-${bloco(letras, 3)}${bloco(numeros, 4)}`;
}

console.log(APLICAR ? "MODO: APLICANDO\n" : "MODO: SIMULAÇÃO (use --apply para criar)\n");

// ── Conferência dos links antes de criar ────────────────────────────────
const c = conectar();
await c.connect();

const { rows: eventoAtivo } = await c.query(
  `select id, nome from public.eventos where status = 'ativo' order by data_inicio desc limit 1`
);
const { rows: sckExistentes } = await c.query(
  `select distinct lower(sck) sck, vendedor_nome from public.links
    where evento_id = $1 and sck is not null and sck <> ''`,
  [eventoAtivo[0]?.id ?? null]
);
const mapaSck = new Map(sckExistentes.map((r) => [r.sck, r.vendedor_nome]));

console.log(`Evento ativo: ${eventoAtivo[0]?.nome ?? "(nenhum)"}\n`);
console.log("── Vínculo com os links ──");
console.table(
  TIME.map((p) => ({
    nome: p.nome.split(" ").slice(0, 2).join(" "),
    cargo: p.cargo,
    sck: p.sck ?? "—",
    "links de": p.sck ? (mapaSck.get(p.sck) ?? "⚠️ SCK NÃO EXISTE") : "⚠️ SEM LINKS",
  }))
);

const orfaos = [...mapaSck.entries()].filter(
  ([sck]) => !TIME.some((p) => p.sck === sck)
);
if (orfaos.length) {
  console.log("\n⚠️  Vendedores com links no evento e SEM ninguém no time novo:");
  orfaos.forEach(([sck, nome]) => console.log(`     ${nome.padEnd(20)} sck=${sck}`));
  console.log("     Esses links existem mas ninguém vai enxergá-los.");
}

// ── Quem criar ──────────────────────────────────────────────────────────
const { data: jaCadastrados } = await sb.from("usuarios").select("email");
const existe = new Set((jaCadastrados ?? []).map((u) => u.email));

const criar = TIME.filter((p) => !existe.has(p.email.toLowerCase()));
const pular = TIME.filter((p) => existe.has(p.email.toLowerCase()));

console.log(`\n── A criar (${criar.length}) ──`);
criar.forEach((p) => console.log(`   ${p.email.padEnd(36)} ${p.nome}`));
if (pular.length) {
  console.log(`\n── Já existem, não serão tocados (${pular.length}) ──`);
  pular.forEach((p) => console.log(`   ${p.email}`));
}

if (!APLICAR) {
  console.log("\nNada foi criado. Rode de novo com --apply.");
  await c.end();
  process.exit(0);
}

// ── Criação ─────────────────────────────────────────────────────────────
console.log("\nCriando...\n");
const senhas = [];

for (const p of criar) {
  const senha = senhaTemporaria();
  const email = p.email.toLowerCase();

  const { data: conta, error: erroAuth } = await sb.auth.admin.createUser({
    email,
    password: senha,
    // Sem envio de e-mail configurado: não confirmar aqui deixaria a pessoa
    // esperando uma mensagem que nunca chega.
    email_confirm: true,
    user_metadata: { nome: p.nome },
  });
  if (erroAuth) {
    console.log(`  ✗ ${email}: ${erroAuth.message}`);
    continue;
  }

  const { error: erroPerfil } = await sb.from("usuarios").insert({
    id: conta.user.id,
    email,
    nome: p.nome,
    papel: "closer",
    ativo: true,
    precisa_trocar_senha: true,
    sck: p.sck,
    criado_por: "docx:time-comercial-10x",
  });
  if (erroPerfil) {
    // Conta sem perfil é fantasma que ainda bloqueia o e-mail. Desfaz.
    await sb.auth.admin.deleteUser(conta.user.id).catch(() => {});
    console.log(`  ✗ ${email}: ${erroPerfil.message}`);
    continue;
  }

  senhas.push({ nome: p.nome, email, senha, links: p.sck ? "sim" : "NÃO" });
  console.log(`  ✓ ${email}`);
}

console.log("\n" + "═".repeat(78));
console.log("SENHAS TEMPORÁRIAS — anote agora. Não dá para consultar depois.");
console.log("Cada pessoa cria a própria senha no primeiro acesso.");
console.log("═".repeat(78));
console.table(senhas);

await c.end();
