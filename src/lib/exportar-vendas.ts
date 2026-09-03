// ─────────────────────────────────────────────────────────────────────────
// Exportação das vendas para planilha Excel.
//
// O formato copia o app anterior (vendas-bruxcon), que o time já conhece:
//   · Ranking            — pontos, vendas, recebido e volume por closer
//   · Todas as Vendas    — resumo, uma linha por venda
//   · Vendas Detalhadas  — todos os campos
//   · Uma aba por closer — só as vendas daquela pessoa
//
// Diferenças em relação ao app antigo, por causa do modelo novo:
//   · A lista de closers não é mais fixa no código: sai das próprias vendas.
//   · Os bônus de ponto (antes colunas fixas "Pt +15k" etc.) agora são
//     regras dinâmicas do evento — viram uma coluna única com o detalhe.
//
// A montagem das LINHAS é função pura (testável). Só a escrita do arquivo
// depende do exceljs, que é importado dinamicamente na tela para não pesar
// o carregamento do app.
// ─────────────────────────────────────────────────────────────────────────

import type { Venda } from "./types";

const fmtR = (v: number) =>
  "R$ " + (v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtD = (iso: string | null) =>
  iso ? new Date(iso + "T12:00:00").toLocaleDateString("pt-BR") : "";

const fmtHora = (isoTs: string) => {
  const d = new Date(isoTs);
  return isNaN(d.getTime())
    ? ""
    : d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
};

const simNao = (b: boolean) => (b ? "Sim" : "Não");

const pts1 = (n: number) => parseFloat((n || 0).toFixed(1));

/** Mais recente primeiro, como a tela de Vendas. */
const ordenar = (vendas: Venda[]) =>
  [...vendas].sort((a, b) => (b.criadoEm || "").localeCompare(a.criadoEm || ""));

// ── Aba 1: Ranking ───────────────────────────────────────────────────────

export function linhasRanking(vendas: Venda[]) {
  const porCloser = new Map<string, { pts: number; vendas: number; recebido: number; vol: number }>();
  for (const v of vendas) {
    const nome = v.closerNome || "(sem nome)";
    const t = porCloser.get(nome) ?? { pts: 0, vendas: 0, recebido: 0, vol: 0 };
    t.pts += v.pts || 0;
    t.vendas += 1;
    t.recebido += v.recebido || 0;
    t.vol += v.valor || 0;
    porCloser.set(nome, t);
  }
  return [...porCloser.entries()]
    .sort((a, b) => b[1].pts - a[1].pts || b[1].recebido - a[1].recebido)
    .map(([nome, t], i) => ({
      "Posição": i + 1,
      "Closer": nome,
      "Pontos": pts1(t.pts),
      "Nº de Vendas": t.vendas,
      "Total Recebido": fmtR(t.recebido),
      "Volume de Vendas": fmtR(t.vol),
    }));
}

// ── Aba 2: Todas as Vendas (resumo) ──────────────────────────────────────

export function linhasResumo(vendas: Venda[]) {
  return ordenar(vendas).map((v) => ({
    "Vendedor": v.closerNome || "",
    "Cliente": v.cliente || "",
    "E-mail": v.email || "",
    "Telefone": v.telefone || "",
    "Data da venda": fmtD(v.dataVenda),
    "Hora": fmtHora(v.criadoEm),
    "Valor da venda": fmtR(v.valor),
    "Valor recebido": fmtR(v.recebido),
    "Observação": v.negociacao || v.observacao || "",
    "Pontos": pts1(v.pts),
  }));
}

// ── Aba 3: Vendas Detalhadas ─────────────────────────────────────────────

export function linhasDetalhadas(vendas: Venda[]) {
  return ordenar(vendas).map((v) => ({
    "Vendedor": v.closerNome || "",
    "Cliente": v.cliente || "",
    "E-mail": v.email || "",
    "Telefone": v.telefone || "",
    "CPF": v.cpf || "",
    "Data da venda": fmtD(v.dataVenda),
    "Hora": fmtHora(v.criadoEm),
    "Produto": v.produto || "",
    "Valor da venda": fmtR(v.valor),
    "Valor recebido": fmtR(v.recebido),
    "Faixa recebimento": v.faixaLabel || "",
    "Receb. completo": simNao(v.completo),
    "Valor restante": fmtR(v.restante),
    "Observação / Negociação": v.negociacao || v.observacao || "",
    "2ª cadeira": simNao(v.cadeira),
    "Valor 2ª cadeira": fmtR(v.valorCadeira),
    "Pontos total": pts1(v.pts),
    // As regras de bônus são do evento (dinâmicas); em vez de uma coluna
    // fixa por regra, o detalhe inteiro numa coluna legível.
    "Detalhe dos pontos": (v.pontosDetalhe || [])
      .map((p) => `${p.label}: ${pts1(p.pontos)}`)
      .join(" · "),
  }));
}

// ── Abas 4+: uma por closer ──────────────────────────────────────────────

export function linhasPorCloser(vendas: Venda[]) {
  const nomes = [...new Set(ordenar(vendas).map((v) => v.closerNome || "(sem nome)"))];
  return nomes.map((nome) => ({
    nome,
    linhas: ordenar(vendas)
      .filter((v) => (v.closerNome || "(sem nome)") === nome)
      .map((v) => ({
        "Cliente": v.cliente || "",
        "E-mail": v.email || "",
        "Telefone": v.telefone || "",
        "Data da venda": fmtD(v.dataVenda),
        "Hora": fmtHora(v.criadoEm),
        "Valor da venda": fmtR(v.valor),
        "Valor recebido": fmtR(v.recebido),
        "Faixa": v.faixaLabel || "",
        "Receb. completo": simNao(v.completo),
        "Valor restante": fmtR(v.restante),
        "Observação": v.negociacao || v.observacao || "",
        "2ª cadeira": simNao(v.cadeira),
        "Pontos": pts1(v.pts),
      })),
  }));
}

/** Nome de aba válido no Excel: sem []:*?/\ e no máximo 31 caracteres. */
export function nomeDeAba(nome: string): string {
  const limpo = nome.replace(/[\[\]:*?/\\]/g, " ").trim() || "Aba";
  return limpo.length > 31 ? limpo.slice(0, 31) : limpo;
}

/** `Cliente_Vendas_17-08-2026_1930.xlsx` */
export function nomeDoArquivo(prefixo: string, agora = new Date()): string {
  const data = agora.toLocaleDateString("pt-BR").replace(/\//g, "-");
  const hora =
    String(agora.getHours()).padStart(2, "0") + String(agora.getMinutes()).padStart(2, "0");
  return `${prefixo}_Vendas_${data}_${hora}.xlsx`;
}

// ── Escrita do arquivo (browser) ─────────────────────────────────────────

const LARGURAS: Record<string, number> = {
  "Posição": 8, "Closer": 16, "Pontos": 8, "Nº de Vendas": 12,
  "Total Recebido": 18, "Volume de Vendas": 18,
  "Vendedor": 16, "Cliente": 32, "E-mail": 30, "Telefone": 16, "CPF": 16,
  "Data da venda": 14, "Hora": 7, "Produto": 26,
  "Valor da venda": 16, "Valor recebido": 16, "Faixa recebimento": 24, "Faixa": 24,
  "Receb. completo": 14, "Valor restante": 16,
  "Observação / Negociação": 50, "Observação": 50,
  "2ª cadeira": 12, "Valor 2ª cadeira": 16,
  "Pontos total": 12, "Detalhe dos pontos": 50,
};

/** Gera o .xlsx e dispara o download. Chamar só no navegador. */
export async function exportarVendasExcel(vendas: Venda[], prefixoArquivo = "Vendas") {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();

  const addAba = (titulo: string, linhas: Record<string, unknown>[]) => {
    if (!linhas.length) return;
    const ws = wb.addWorksheet(nomeDeAba(titulo));
    const chaves = Object.keys(linhas[0]);
    ws.columns = chaves.map((k) => ({ header: k, key: k, width: LARGURAS[k] ?? 16 }));
    for (const l of linhas) ws.addRow(l);
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: "frozen", ySplit: 1 }];
  };

  addAba("Ranking", linhasRanking(vendas));
  addAba("Todas as Vendas", linhasResumo(vendas));
  addAba("Vendas Detalhadas", linhasDetalhadas(vendas));
  for (const c of linhasPorCloser(vendas)) addAba(c.nome, c.linhas);

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeDoArquivo(prefixoArquivo);
  a.click();
  URL.revokeObjectURL(url);
}
