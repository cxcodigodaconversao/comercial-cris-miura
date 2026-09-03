// Prova de fogo das políticas RLS.  Uso:  npm run testar-rls
//
// Tudo roda dentro de UMA transação com ROLLBACK no fim: cria usuários e
// vendas de mentira, prova as políticas e não deixa nada no banco.
//
// Rodar SEMPRE que mexer em política, trigger ou nas funções de papel —
// é o que impede uma mudança de abrir o banco sem ninguém perceber.

import { conectar } from "./db.mjs";

const ADMIN = "11111111-1111-1111-1111-111111111111";
const GESTOR = "22222222-2222-2222-2222-222222222222";
const CLOSER_A = "33333333-3333-3333-3333-333333333333";
const CLOSER_B = "44444444-4444-4444-4444-444444444444";
const INATIVO = "55555555-5555-5555-5555-555555555555";
const PROMOTOR = "aaaa0000-0000-0000-0000-00000000aaaa";
const EVENTO = "66666666-6666-6666-6666-666666666666";
const VENDA_A = "77777777-7777-7777-7777-777777777777";
const VENDA_B = "88888888-8888-8888-8888-888888888888";
const LEAD = "99999999-9999-9999-9999-999999999999";

const c = conectar();
await c.connect();
await c.query("begin");

let ok = 0;
let falhou = 0;

/** Executa como um usuário logado (role authenticated + claim sub). */
async function como(uid, sql, params) {
  await c.query("savepoint sp");
  try {
    await c.query(`set local role authenticated`);
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: uid, role: "authenticated" }),
    ]);
    const r = await c.query(sql, params);
    await c.query("reset role");
    await c.query("release savepoint sp");
    return { ok: true, rows: r.rows, count: r.rowCount };
  } catch (e) {
    await c.query("rollback to savepoint sp");
    await c.query("reset role");
    return { ok: false, erro: e.message };
  }
}

function checar(descricao, condicao, detalhe = "") {
  if (condicao) {
    ok++;
    console.log(`  ✓ ${descricao}`);
  } else {
    falhou++;
    console.log(`  ✗ ${descricao}  ${detalhe}`);
  }
}

// ── Montagem (como postgres, ignora RLS) ────────────────────────────────
const usuarios = [
  [ADMIN, "admin@teste.local", "Admin Teste", "admin", true],
  [GESTOR, "gestor@teste.local", "Gestor Teste", "gestor", true],
  [CLOSER_A, "closera@teste.local", "Closer A", "closer", true],
  [CLOSER_B, "closerb@teste.local", "Closer B", "closer", true],
  [INATIVO, "inativo@teste.local", "Inativo", "closer", false],
  [PROMOTOR, "promotor@teste.local", "Promotor Teste", "promotor", true],
];
for (const [id, email] of usuarios) {
  await c.query(
    `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
     values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2, 'x', now(), now())`,
    [id, email]
  );
}
for (const [id, email, nome, papel, ativo] of usuarios) {
  await c.query(
    `insert into public.usuarios (id, email, nome, papel, ativo) values ($1,$2,$3,$4,$5)`,
    [id, email, nome, papel, ativo]
  );
}
await c.query(
  `insert into public.eventos (id, nome, slug, marca, data_inicio, data_fim, status)
   values ($1, 'Evento Teste', 'evento-teste', 'IMA_BH', current_date, current_date, 'ativo')`,
  [EVENTO]
);
await c.query(
  `insert into public.leads (id, evento_id, codigo_cracha, nome, cpf, email)
   values ($1,$2,'CRACHA-1','Lead Teste','000','lead@teste.local')`,
  [LEAD, EVENTO]
);

const inserirVenda = (id, uid, nome) => [
  `insert into public.vendas (id, evento_id, usuario_id, closer_nome, email_closer, cliente, valor, pts)
   values ($1,$2,$3,$4,'x@y.z','Cliente',1000,2)`,
  [id, EVENTO, uid, nome],
];

console.log("\n── VENDAS ─────────────────────────────────────────────");

let r = await como(CLOSER_A, ...inserirVenda(VENDA_A, CLOSER_A, "Closer A"));
checar("closer registra a PRÓPRIA venda", r.ok, r.erro);

r = await como(CLOSER_A, ...inserirVenda("aaaaaaaa-0000-0000-0000-000000000001", CLOSER_B, "Closer B"));
checar("closer NÃO registra venda no nome de outro", !r.ok);

await c.query(...inserirVenda(VENDA_B, CLOSER_B, "Closer B"));

// As contagens são sempre ESCOPADAS ao evento de teste. Sem isso, o teste
// só passa com o banco vazio e começa a falhar sozinho quando entra dado
// real — foi o que aconteceu depois de importar o primeiro evento.
const doEvento = `where evento_id = '${EVENTO}'`;

r = await como(CLOSER_A, `select id from public.vendas ${doEvento}`);
checar("closer vê só as próprias vendas", r.ok && r.count === 1, `viu ${r.count}`);

r = await como(GESTOR, `select id from public.vendas ${doEvento}`);
checar("gestor vê todas as vendas", r.ok && r.count === 2, `viu ${r.count}`);

r = await como(ADMIN, `select id from public.vendas ${doEvento}`);
checar("admin vê todas as vendas", r.ok && r.count === 2, `viu ${r.count}`);

r = await como(CLOSER_A, `update public.vendas set valor = 2000 where id = $1`, [VENDA_A]);
checar("closer edita a própria venda", r.ok && r.count === 1, r.erro);

r = await como(CLOSER_A, `update public.vendas set valor = 999 where id = $1`, [VENDA_B]);
checar("closer NÃO edita venda de outro", r.ok && r.count === 0, `afetou ${r.count}`);

r = await como(CLOSER_A, `update public.vendas set usuario_id = $2 where id = $1`, [VENDA_A, CLOSER_B]);
checar("NINGUÉM transfere venda para outro dono", !r.ok, r.erro);

r = await como(CLOSER_A, `delete from public.vendas where id = $1`, [VENDA_A]);
checar("closer NÃO exclui venda", r.ok && r.count === 0, `afetou ${r.count}`);

r = await como(GESTOR, `delete from public.vendas where id = $1`, [VENDA_A]);
checar("gestor NÃO exclui venda", r.ok && r.count === 0, `afetou ${r.count}`);

console.log("\n── PROMOTOR (operador de contratos) ───────────────────");

r = await como(PROMOTOR, `select id from public.vendas ${doEvento}`);
checar("promotor vê TODAS as vendas do evento", r.ok && r.count === 2, `viu ${r.count}`);

r = await como(PROMOTOR,
  `update public.vendas set contrato = 'Entrada de R$ 1.000,00...', contrato_em = now() where id = $1`,
  [VENDA_B]);
checar("promotor grava o contrato em venda de outro", r.ok && r.count === 1, r.erro);

r = await como(PROMOTOR, `update public.vendas set valor = 999999 where id = $1`, [VENDA_B]);
checar("promotor NÃO altera o valor de venda alheia", !r.ok, r.erro);

r = await como(PROMOTOR, `update public.vendas set pts = 99 where id = $1`, [VENDA_B]);
checar("promotor NÃO altera a pontuação de venda alheia", !r.ok, r.erro);

r = await como(PROMOTOR, `update public.vendas set cliente = 'Trocado' where id = $1`, [VENDA_B]);
checar("promotor NÃO troca o cliente de venda alheia", !r.ok, r.erro);

r = await como(PROMOTOR, `delete from public.vendas where id = $1`, [VENDA_B]);
checar("promotor NÃO exclui venda", r.ok && r.count === 0, `afetou ${r.count}`);

// O promotor nem registra venda: a aba some da tela, mas esconder botão não
// é permissão — sem a política, a inserção valeria por chamada direta à API
// com a mesma credencial que ele já tem no navegador.
r = await como(PROMOTOR, ...inserirVenda("cccccccc-0000-0000-0000-000000000001", PROMOTOR, "Promotor Teste"));
checar("promotor NÃO registra venda nem para si", !r.ok, r.erro);

r = await como(PROMOTOR, `update public.eventos set metas = '[]'::jsonb where id = $1`, [EVENTO]);
checar("promotor NÃO mexe na configuração do evento", r.ok && r.count === 0, `afetou ${r.count}`);

// Valor DIFERENTE do atual de propósito: o trigger compara antigo × novo,
// então "mudar" um campo para o valor que ele já tem passa — e passaria
// mesmo com a permissão certa, mascarando o teste.
r = await como(PROMOTOR, `update public.leads set cpf = '777' where id = $1`, [LEAD]);
checar("promotor NÃO edita cadastro de lead", !r.ok, r.erro);

console.log("\n── USUÁRIOS ───────────────────────────────────────────");

r = await como(CLOSER_A, `update public.usuarios set papel = 'admin' where id = $1`, [CLOSER_A]);
checar("closer NÃO se promove a admin", !r.ok, r.erro);

r = await como(CLOSER_A, `update public.usuarios set precisa_trocar_senha = false where id = $1`, [CLOSER_A]);
checar("usuário baixa a própria flag de senha", r.ok && r.count === 1, r.erro);

r = await como(CLOSER_A, `update public.usuarios set nome = 'Hackeado' where id = $1`, [CLOSER_B]);
checar("closer NÃO edita cadastro de outro", r.ok && r.count === 0, `afetou ${r.count}`);

r = await como(CLOSER_A, `delete from public.usuarios where id = $1`, [CLOSER_B]);
checar("closer NÃO exclui usuário", r.ok && r.count === 0, `afetou ${r.count}`);

console.log("\n── USUÁRIO DESATIVADO ─────────────────────────────────");

r = await como(INATIVO, `select id from public.vendas`);
checar("desativado não vê venda nenhuma", r.ok && r.count === 0, `viu ${r.count}`);

r = await como(INATIVO, `select id from public.eventos`);
checar("desativado não vê evento nenhum", r.ok && r.count === 0, `viu ${r.count}`);

r = await como(INATIVO, ...inserirVenda("bbbbbbbb-0000-0000-0000-000000000001", INATIVO, "Inativo"));
checar("desativado não registra venda", !r.ok);

console.log("\n── EVENTOS ────────────────────────────────────────────");

r = await como(GESTOR, `update public.eventos set regras = '[]'::jsonb where id = $1`, [EVENTO]);
checar("gestor NÃO altera as regras de pontuação", r.ok && r.count === 0, `afetou ${r.count}`);

r = await como(ADMIN, `update public.eventos set nome = 'Renomeado' where id = $1`, [EVENTO]);
checar("admin altera o evento", r.ok && r.count === 1, r.erro);

r = await como(CLOSER_A, `select id from public.eventos where id = '${EVENTO}'`);
checar("closer lê os eventos", r.ok && r.count === 1, `viu ${r.count}`);

console.log("\n── LEADS ──────────────────────────────────────────────");

r = await como(CLOSER_A, `update public.leads set status = 'abordado', abordado_por = $2 where id = $1`, [LEAD, CLOSER_A]);
checar("closer move o lead no funil", r.ok && r.count === 1, r.erro);

r = await como(CLOSER_A, `update public.leads set cpf = '999' where id = $1`, [LEAD]);
checar("closer NÃO edita cadastro do lead", !r.ok, r.erro);

r = await como(ADMIN, `update public.leads set cpf = '111' where id = $1`, [LEAD]);
checar("admin corrige cadastro do lead", r.ok && r.count === 1, r.erro);

console.log("\n── AUDITORIA ──────────────────────────────────────────");

r = await como(CLOSER_A,
  `insert into public.venda_auditoria (venda_id, evento_id, acao, por_usuario, por_nome)
   values ($1,$2,'editou',$3,'Closer A')`, [VENDA_A, EVENTO, CLOSER_A]);
checar("closer grava o próprio rastro", r.ok, r.erro);

r = await como(CLOSER_A,
  `insert into public.venda_auditoria (venda_id, evento_id, acao, por_usuario, por_nome)
   values ($1,$2,'editou',$3,'Fingindo ser o gestor')`, [VENDA_A, EVENTO, GESTOR]);
checar("closer NÃO grava rastro no nome de outro", !r.ok);

r = await como(ADMIN, `update public.venda_auditoria set por_nome = 'Outro'`);
checar("NEM O ADMIN reescreve o rastro", r.ok && r.count === 0, `afetou ${r.count}`);

r = await como(ADMIN, `delete from public.venda_auditoria`);
checar("NEM O ADMIN apaga o rastro", r.ok && r.count === 0, `afetou ${r.count}`);

console.log("\n── EXCLUSÃO DE USUÁRIO COM VENDA (trava do banco) ─────");

try {
  await c.query("savepoint sp2");
  await c.query(`delete from public.usuarios where id = $1`, [CLOSER_A]);
  await c.query("rollback to savepoint sp2");
  checar("banco recusa excluir usuário que tem venda", false, "deixou excluir!");
} catch (e) {
  await c.query("rollback to savepoint sp2");
  checar("banco recusa excluir usuário que tem venda", e.message.includes("vendas"), e.message.slice(0, 70));
}

// ── Fim ─────────────────────────────────────────────────────────────────
await c.query("rollback");
await c.end();

console.log(`\n${"─".repeat(56)}`);
console.log(`${ok} passaram · ${falhou} falharam`);
console.log("Transação desfeita — nada gravado no banco.");
process.exitCode = falhou ? 1 : 0;
