// ─────────────────────────────────────────────────────────────────────────
// Análise de inscritos — parser do painel + KPIs.
//
// Tudo aqui é função pura (sem tela, sem banco) e testado:
//   · `extrairInscritosDoPainel` lê o index.html do painel de conversão e
//     devolve a lista normalizada — é o que a API de importação usa.
//   · `calcularAnalise` recebe inscritos + vendas e devolve os números que
//     a aba mostra. A junção inscrito ↔ venda é por e-mail normalizado: é o
//     único campo que existe dos dois lados.
//
// As classes de Lead Score vêm do painel (AA, A, B, C, D, E, F; X = sem
// formulário). Este módulo não recalcula a nota — só lê e agrega.
// ─────────────────────────────────────────────────────────────────────────

import type { Venda } from "./types";

export const CLASSES = ["AA", "A", "B", "C", "D", "E", "F", "X"] as const;
export type Classe = (typeof CLASSES)[number];

export type Inscrito = {
  email: string;
  nome: string;
  whatsapp: string | null;
  classe: Classe;
  nota: number | null;
  perfil: number | null;
  comprometimento: number | null;
  tipo: string | null;
  jaAluno: boolean | null;
  faturamento: string | null;
  idade: string | null;
  tempoFormado: string | null;
  areaAtuacao: string | null;
  categoriaTicket: string | null;
  temProduto: boolean;
  produtos: string | null;
  checkinFeito: boolean;
  d1: boolean;
  d2: boolean;
  d3: boolean;
  ligou: boolean;
  resultadoLigacao: string | null;
  contatoConfirmou: string | null;
  extras: Record<string, unknown>;
};

// ── Normalização ────────────────────────────────────────────────────────

export const normalizarEmail = (e: string | null | undefined) =>
  (e ?? "").trim().toLowerCase();

const bool = (v: unknown): boolean => v === true || v === "True" || v === "true" || v === 1;
const boolOuNulo = (v: unknown): boolean | null => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  if (s === "sim" || s === "true") return true;
  if (s === "não" || s === "nao" || s === "false") return false;
  return null;
};
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const txt = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
};

const CAMPOS_TIPADOS = new Set([
  "email", "nome", "whatsapp", "classe", "nota", "perfil", "comprometimento", "tipo",
  "ja_aluno", "faturamento", "idade", "tempo_formado", "area_atuacao", "categoria_ticket",
  "tem_produto", "produtos", "checkin_feito", "d1", "d2", "d3", "ligou",
  "resultado_ligacao", "contato_confirmou",
]);

/** Uma linha crua do JSON do painel → Inscrito. Devolve null se não tiver e-mail. */
export function normalizarLinha(r: Record<string, unknown>): Inscrito | null {
  const email = normalizarEmail(txt(r.email));
  if (!email || !email.includes("@")) return null;
  const classeCru = String(r.classe ?? "X").toUpperCase().trim();
  const classe = (CLASSES as readonly string[]).includes(classeCru) ? (classeCru as Classe) : "X";

  const extras: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) {
    if (!CAMPOS_TIPADOS.has(k) && v !== null && v !== undefined && v !== "") extras[k] = v;
  }

  return {
    email,
    nome: txt(r.nome) ?? email,
    whatsapp: txt(r.whatsapp),
    classe,
    nota: num(r.nota),
    perfil: num(r.perfil),
    comprometimento: num(r.comprometimento),
    tipo: txt(r.tipo),
    jaAluno: boolOuNulo(r.ja_aluno),
    faturamento: txt(r.faturamento),
    idade: txt(r.idade),
    tempoFormado: txt(r.tempo_formado),
    areaAtuacao: txt(r.area_atuacao),
    categoriaTicket: txt(r.categoria_ticket),
    temProduto: bool(r.tem_produto),
    produtos: txt(r.produtos),
    checkinFeito: bool(r.checkin_feito),
    d1: bool(r.d1),
    d2: bool(r.d2),
    d3: bool(r.d3),
    ligou: bool(r.ligou),
    resultadoLigacao: txt(r.resultado_ligacao),
    contatoConfirmou: txt(r.contato_confirmou),
    extras,
  };
}

/**
 * Lê o index.html do painel (ou um .json puro) e devolve os inscritos.
 * O painel embute os dados em `<script id="data" type="application/json">`.
 * Linhas sem e-mail são descartadas; e-mails repetidos ficam com a última.
 */
export function extrairInscritosDoPainel(conteudo: string): { inscritos: Inscrito[]; descartados: number } {
  let json = conteudo.trim();
  const m = conteudo.match(/<script\s+id="data"\s+type="application\/json">([\s\S]*?)<\/script>/i);
  if (m) json = m[1].trim();

  let dados: unknown;
  try {
    dados = JSON.parse(json);
  } catch {
    throw new Error("Não encontrei os dados do painel. Envie o index.html gerado pelo painel de conversão.");
  }
  const rows: unknown = Array.isArray(dados) ? dados : (dados as { rows?: unknown })?.rows;
  if (!Array.isArray(rows)) throw new Error("O arquivo não tem a lista de inscritos (rows).");

  const porEmail = new Map<string, Inscrito>();
  let descartados = 0;
  for (const r of rows) {
    const i = r && typeof r === "object" ? normalizarLinha(r as Record<string, unknown>) : null;
    if (i) porEmail.set(i.email, i);
    else descartados++;
  }
  return { inscritos: [...porEmail.values()], descartados };
}

// ── KPIs ────────────────────────────────────────────────────────────────

export type Contagem = { label: string; n: number };

export type Analise = {
  total: number;
  comNota: number;
  semNota: number;
  mqlTop: number;      // AA + A + B  (mesma definição do painel)
  mqlAmplo: number;    // AA + A + B + C
  pctMqlTop: number;   // sobre quem tem nota
  jaAlunos: number;
  porClasse: { classe: Classe; n: number; vendas: number; conversao: number }[];
  checkin: { feito: number; d1: number; d2: number; d3: number; pctFeito: number };
  funil: { ligou: number; atendeu: number; naoAtendeu: number; confirmou: number; desconfirmou: number };
  faturamento: Contagem[];
  tempoFormado: Contagem[];
  area: Contagem[];
  idade: Contagem[];
  // Cruzamento com vendas
  compraram: number;               // inscritos com venda (por e-mail)
  vendasSemInscricao: number;      // vendas cujo e-mail não está na base
  conversaoGeral: number;          // compraram / total
  conversaoCheckin: number;        // compraram / checkin feito
  volumeInscritos: number;         // soma do valor das vendas casadas
};

const ORDEM_FATURAMENTO = [
  "Estou desempregado(a) no momento.",
  "Menos de R$ 5.000,01",
  "De R$ 5.001 a R$ 7.500",
  "De R$ 7.501 a R$ 10.000",
  "De R$ 10.001 a R$ 20.000",
  "De R$ 20.001 a R$ 30.000",
  "De R$ 30.001 a R$ 40.000",
  "Acima de R$ 40.000",
];

function contar(valores: (string | null)[], ordem?: string[]): Contagem[] {
  const mapa = new Map<string, number>();
  for (const v of valores) if (v) mapa.set(v, (mapa.get(v) ?? 0) + 1);
  const lista = [...mapa.entries()].map(([label, n]) => ({ label, n }));
  if (ordem) {
    const pos = (l: string) => { const i = ordem.indexOf(l); return i === -1 ? 999 : i; };
    return lista.sort((a, b) => pos(a.label) - pos(b.label));
  }
  return lista.sort((a, b) => b.n - a.n);
}

const pct = (parte: number, todo: number) => (todo > 0 ? Math.round((parte / todo) * 1000) / 10 : 0);

export function calcularAnalise(inscritos: Inscrito[], vendas: Venda[]): Analise {
  const total = inscritos.length;
  const comNota = inscritos.filter((i) => i.classe !== "X").length;

  // Junção por e-mail: uma venda "casa" se o e-mail do cliente é de um inscrito.
  const emailsInscritos = new Set(inscritos.map((i) => i.email));
  const vendasPorEmail = new Map<string, Venda[]>();
  let vendasSemInscricao = 0;
  for (const v of vendas) {
    const e = normalizarEmail(v.email);
    if (e && emailsInscritos.has(e)) {
      vendasPorEmail.set(e, [...(vendasPorEmail.get(e) ?? []), v]);
    } else {
      vendasSemInscricao++;
    }
  }
  const comprou = (i: Inscrito) => vendasPorEmail.has(i.email);

  const porClasse = CLASSES.map((classe) => {
    const grupo = inscritos.filter((i) => i.classe === classe);
    const compraram = grupo.filter(comprou).length;
    return { classe, n: grupo.length, vendas: compraram, conversao: pct(compraram, grupo.length) };
  });

  const checkinFeito = inscritos.filter((i) => i.checkinFeito).length;
  const compraram = inscritos.filter(comprou).length;
  const volumeInscritos = [...vendasPorEmail.values()].flat().reduce((a, v) => a + (v.valor || 0), 0);

  const nDa = (cl: string) => porClasse.find((c) => c.classe === cl)?.n ?? 0;
  const mqlTop = nDa("AA") + nDa("A") + nDa("B");
  const mqlAmplo = mqlTop + nDa("C");

  return {
    total,
    comNota,
    semNota: total - comNota,
    mqlTop,
    mqlAmplo,
    pctMqlTop: pct(mqlTop, comNota),
    jaAlunos: inscritos.filter((i) => i.jaAluno === true).length,
    porClasse,
    checkin: {
      feito: checkinFeito,
      d1: inscritos.filter((i) => i.d1).length,
      d2: inscritos.filter((i) => i.d2).length,
      d3: inscritos.filter((i) => i.d3).length,
      pctFeito: pct(checkinFeito, total),
    },
    funil: {
      ligou: inscritos.filter((i) => i.ligou).length,
      atendeu: inscritos.filter((i) => i.resultadoLigacao === "Atendeu").length,
      naoAtendeu: inscritos.filter((i) => i.resultadoLigacao === "Não atendeu").length,
      confirmou: inscritos.filter((i) => i.contatoConfirmou === "Confirmou").length,
      desconfirmou: inscritos.filter((i) => i.contatoConfirmou === "Desconfirmou").length,
    },
    faturamento: contar(inscritos.map((i) => i.faturamento), ORDEM_FATURAMENTO),
    tempoFormado: contar(inscritos.map((i) => i.tempoFormado)),
    area: contar(inscritos.map((i) => i.areaAtuacao)),
    idade: contar(inscritos.map((i) => i.idade)),
    compraram,
    vendasSemInscricao,
    conversaoGeral: pct(compraram, total),
    conversaoCheckin: pct(compraram, checkinFeito),
    volumeInscritos,
  };
}
