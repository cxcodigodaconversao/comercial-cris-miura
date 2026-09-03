// ─────────────────────────────────────────────────────────────────────────
// Importa data/leads.json e data/links.json para o Postgres do Supabase.
//
// Estes arquivos são a MESMA origem que alimentou o Firestore na v1 (o antigo
// scripts/seed.mjs lia daqui), então não é preciso exportar nada do Firebase.
//
// Uso:
//   node scripts/importar-leads-links.mjs                # simulação
//   node scripts/importar-leads-links.mjs --apply
//
// IDEMPOTENTE: usa upsert com chave (evento, código do crachá) e
// (evento, oferta, vendedor). Rodar duas vezes não duplica.
// ─────────────────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { conectar } from "./db.mjs";

const APLICAR = process.argv.includes("--apply");
const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");

// O evento de origem dos dados. Os leads são a base de credenciamento e os
// links são as ofertas Hotmart desta edição — os dois são POR EVENTO.
const EVENTO = {
  nome: "IMA BH Setembro/2026",
  slug: "ima-bh-2026",
  marca: "IMA_BH",
  cidade: "São Paulo",
  uf: "SP",
  data_inicio: "2026-07-24",
  data_fim: "2026-07-26",
  status: "encerrado",
};

// Configuração padrão do evento — cópia dos valores de src/lib/config.ts.
// Repetida aqui porque este script é .mjs puro e não passa pelo build do app.
const FAIXAS_PADRAO = [
  { label: "Abaixo de R$ 15.000", min: 0, max: 14999.99 },
  { label: "R$ 15.000 até R$ 29.996", min: 15000, max: 29996.99 },
  { label: "Acima de R$ 29.997", min: 29997 },
];
const PRODUTOS_PADRAO = [{ id: "produto-principal", nome: "Produto principal (edite no evento)" }];
const REGRAS_PADRAO = [
  { id: "base", label: "Ponto recorrente (base)", tag: "1", pontos: 1, tipo: "base", ativo: true },
  {
    id: "faixa-alta", label: "Recebido acima de R$ 15.000", tag: "+1", pontos: 1, tipo: "condicao",
    condicoes: [{ campo: "faixaIndex", op: ">=", valor: 1 }], ativo: true,
  },
  {
    id: "completo", label: "Recebimento completo", tag: "+1", pontos: 1, tipo: "condicao",
    condicoes: [{ campo: "completo", op: "é", valor: true }], ativo: true,
  },
  {
    id: "segunda-cadeira", label: "2ª cadeira incluída", tag: "+½", pontos: 0.5, tipo: "condicao",
    condicoes: [{ campo: "cadeira", op: "é", valor: true }], ativo: true,
  },
];

const leads = JSON.parse(readFileSync(join(raiz, "data/leads.json"), "utf8"));
const arquivoLinks = JSON.parse(readFileSync(join(raiz, "data/links.json"), "utf8"));
const links = arquivoLinks.links ?? arquivoLinks;

const c = conectar();
await c.connect();

try {
  console.log(APLICAR ? "MODO: APLICANDO\n" : "MODO: SIMULAÇÃO (use --apply para gravar)\n");

  // ── Conferência antes de tocar no banco ──────────────────────────────
  const crachasVazios = leads.filter((l) => !String(l.id ?? "").trim()).length;
  const crachas = leads.map((l) => String(l.id));
  const crachasRepetidos = crachas.length - new Set(crachas).size;
  const semNome = leads.filter((l) => !String(l.nome ?? "").trim()).length;

  const chaveLink = (l) => `${l.off}|${l.nome}`;
  const chavesLink = links.map(chaveLink);
  const linksRepetidos = chavesLink.length - new Set(chavesLink).size;
  const semUrl = links.filter((l) => !String(l.url ?? "").trim()).length;

  console.log(`LEADS: ${leads.length}`);
  console.log(`  sem código de crachá: ${crachasVazios}`);
  console.log(`  códigos repetidos:    ${crachasRepetidos}`);
  console.log(`  sem nome:             ${semNome}`);
  console.log(`  tipos: ${[...new Set(leads.map((l) => l.tipo))].length} distintos`);

  console.log(`\nLINKS: ${links.length}`);
  console.log(`  chaves (oferta+vendedor) repetidas: ${linksRepetidos}`);
  console.log(`  sem URL:                            ${semUrl}`);
  console.log(`  vendedores: ${[...new Set(links.map((l) => l.nome))].length} distintos`);

  if (crachasVazios || semNome || semUrl) {
    console.error("\n❌ ABORTADO: há registros sem campo obrigatório. Corrija a origem antes.");
    process.exit(1);
  }
  if (crachasRepetidos || linksRepetidos) {
    console.log(
      "\n⚠️  Há chaves repetidas na origem. O upsert vai manter a ÚLTIMA ocorrência\n" +
        "   de cada uma — o total gravado será menor que o total do arquivo."
    );
  }

  if (!APLICAR) {
    console.log("\nNada foi gravado. Rode de novo com --apply.");
    process.exit(0);
  }

  await c.query("begin");

  // ── Evento ───────────────────────────────────────────────────────────
  const ev = await c.query(
    `insert into public.eventos (nome, slug, marca, cidade, uf, data_inicio, data_fim, status,
                                 produtos, faixas, regras, metas, desempate, criado_por)
     values ($1,$2,$3::public.marca,$4,$5,$6,$7,$8::public.status_evento,
             $9::jsonb,$10::jsonb,$11::jsonb,'[]'::jsonb,'recebido','importacao')
     on conflict (slug) do update set nome = excluded.nome
     returning id, (xmax = 0) as criado`,
    [
      EVENTO.nome, EVENTO.slug, EVENTO.marca, EVENTO.cidade, EVENTO.uf,
      EVENTO.data_inicio, EVENTO.data_fim, EVENTO.status,
      JSON.stringify(PRODUTOS_PADRAO), JSON.stringify(FAIXAS_PADRAO), JSON.stringify(REGRAS_PADRAO),
    ]
  );
  const eventoId = ev.rows[0].id;
  console.log(`\nEvento ${ev.rows[0].criado ? "criado" : "já existia"}: ${EVENTO.nome} (${eventoId})`);

  // ── Leads ────────────────────────────────────────────────────────────
  let nLeads = 0;
  for (let i = 0; i < leads.length; i += 500) {
    const lote = leads.slice(i, i + 500);
    const valores = [];
    const params = [];
    lote.forEach((l, k) => {
      const b = k * 9;
      valores.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9})`);
      params.push(
        eventoId, String(l.id), l.tipo ?? null, String(l.nome).trim(),
        l.email ?? null, l.cpf ?? null, l.telefone ?? null,
        l.especialidade ?? null, l.cor ?? null
      );
    });
    const r = await c.query(
      `insert into public.leads (evento_id, codigo_cracha, tipo, nome, email, cpf, telefone, especialidade, cor)
       values ${valores.join(",")}
       on conflict (evento_id, codigo_cracha) do update set
         tipo = excluded.tipo, nome = excluded.nome, email = excluded.email,
         cpf = excluded.cpf, telefone = excluded.telefone,
         especialidade = excluded.especialidade, cor = excluded.cor`,
      params
    );
    nLeads += r.rowCount;
    process.stdout.write(`\r  leads: ${Math.min(i + 500, leads.length)}/${leads.length}`);
  }
  process.stdout.write("\n");

  // ── Links ────────────────────────────────────────────────────────────
  let nLinks = 0;
  for (const l of links) {
    const r = await c.query(
      `insert into public.links (evento_id, vendedor_nome, sck, status, oferta, valor, condicao, url)
       values ($1,$2,$3,$4,$5,$6,$7,$8)
       on conflict (evento_id, oferta, vendedor_nome) do update set
         sck = excluded.sck, status = excluded.status, valor = excluded.valor,
         condicao = excluded.condicao, url = excluded.url`,
      [eventoId, l.nome, l.sck ?? null, l.status ?? null, l.off, l.valor ?? null, l.condicao ?? null, l.url]
    );
    nLinks += r.rowCount;
  }

  // ── Conferência depois de gravar ─────────────────────────────────────
  const conf = await c.query(
    `select (select count(*) from public.leads where evento_id = $1)::int leads,
            (select count(*) from public.links where evento_id = $1)::int links,
            (select count(distinct vendedor_nome) from public.links where evento_id = $1)::int vendedores`,
    [eventoId]
  );

  await c.query("commit");

  const { leads: totalLeads, links: totalLinks, vendedores } = conf.rows[0];
  console.log(`  links: ${nLinks}\n`);
  console.log("── No banco depois do import ──");
  console.log(`  leads:      ${totalLeads} (arquivo: ${leads.length})`);
  console.log(`  links:      ${totalLinks} (arquivo: ${links.length})`);
  console.log(`  vendedores: ${vendedores}`);
  console.log("\n✓ Importação concluída.");
} catch (e) {
  await c.query("rollback").catch(() => {});
  console.error("\n❌ FALHOU (rollback feito):", e.message);
  process.exitCode = 1;
} finally {
  await c.end();
}
