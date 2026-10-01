import type { Faixa, Papel, Produto, Regra } from "./types";

// ─────────────────────────────────────────────────────────────────────────
// O que este arquivo NÃO tem mais (e por quê):
//   · EMAIL_MAP  → virou a coleção `usuarios` (gerida pela tela de usuários)
//   · CLOSERS    → virou a equipe do evento (eventos/{id}/equipe)
//   · FAIXA_LABELS / getPts → viraram configuração do evento
// Sobraram os formatadores e os PADRÕES usados ao criar um evento novo.
// ─────────────────────────────────────────────────────────────────────────

export const fmtVal = (v: number) =>
  "R$ " + (v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

export const fmtValExato = (v: number) =>
  "R$ " + (v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtPts = (n: number) => (n % 1 === 0 ? n.toString() : n.toFixed(1).replace(".", ","));

/** Data pura do banco (YYYY-MM-DD). O meio-dia evita o fuso puxar para o dia anterior. */
export const fmtData = (iso: string | null) =>
  iso ? new Date(iso + "T12:00:00").toLocaleDateString("pt-BR") : "";

/** Hora de um timestamptz (criado_em). */
export const fmtHora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";

export const PAPEL_LABEL = {
  admin: "Administrador",
  gestor: "Gestor",
  closer: "Vendedor",
  promotor: "Promotor",
} as const;

/**
 * Quem enxerga números agregados (ranking, totais do evento, meta).
 * O promotor lê a venda de todo mundo, mas fica fora da disputa: para ele,
 * a tela mostra o valor de cada contrato e nenhuma soma.
 */
export const veAgregados = (papel: Papel) => papel === "admin" || papel === "gestor";

/** Quem lê as vendas do evento inteiro — inclui o promotor. */
export const leTodasAsVendas = (papel: Papel) =>
  papel === "admin" || papel === "gestor" || papel === "promotor";

/** Quem coordena: edita venda alheia, corrige lead, mexe na equipe. */
export const coordena = (papel: Papel) => papel === "admin" || papel === "gestor";

/** Cor de cada marca — vira `--brand` quando o evento é selecionado. */
export const CORES_MARCA = {
  IMA_BH: "#0E6B66",
  MENTORIA: "#33404D",
  CONGRESSO: "#7A4B1E",
} as const;

// ── Padrões de um evento novo ───────────────────────────────────────────
// Calibrado para o ticket de R$ 35.000. Servem de ponto de partida ao criar
// evento — ajuste por operação na tela própria.
//
// `min` e `max` são INCLUSIVOS: R$ 35.963 cai na faixa do meio, e a faixa
// alta começa em R$ 35.963,01.

export const FAIXAS_PADRAO: Faixa[] = [
  { label: "Abaixo de R$ 15.000", min: 0, max: 14999.99 },
  { label: "R$ 15.000 até R$ 35.963", min: 15000, max: 35963 },
  { label: "Acima de R$ 35.963", min: 35963.01 },
];

export const PRODUTOS_PADRAO: Produto[] = [{ id: "produto-principal", nome: "Produto principal (edite no evento)" }];

export const REGRAS_PADRAO: Regra[] = [
  {
    // Pontos escalonados por faixa (1 / 2 / 3), não somados: a posição na
    // tabela é o índice da faixa em FAIXAS_PADRAO, na mesma ordem.
    id: "faixa",
    label: "Pontos por faixa de recebimento",
    tag: "1-3",
    pontos: 0, // não usado em porFaixa: quem manda é pontosPorFaixa
    tipo: "porFaixa",
    pontosPorFaixa: [1, 2, 3],
    ativo: true,
  },
  {
    id: "segunda-cadeira",
    label: "2ª cadeira incluída",
    tag: "+½",
    pontos: 0.5,
    tipo: "condicao",
    condicoes: [{ campo: "cadeira", op: "é", valor: true }],
    ativo: true,
  },
];
