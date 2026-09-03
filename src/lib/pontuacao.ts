import type { CondicaoRegra, PontoDetalhe, Regra } from "./types";

/**
 * Interpretador das regras de pontuação do evento.
 *
 * Regra vem do banco (um admin escreveu pela tela), então é DADO, nunca
 * código: sem `eval`, sem `new Function`. Cada tipo de regra é uma função
 * fechada aqui dentro, e campo desconhecido simplesmente não pontua.
 */

/** Campos que uma condição pode consultar. */
export type ContextoVenda = {
  valor: number;
  recebido: number;
  restante: number;
  faixaIndex: number | null;
  completo: boolean | null;
  cadeira: boolean | null;
  produtoId?: string;
  /** Respostas de campos configuráveis do evento (extensão futura). */
  campos?: Record<string, string | number | boolean | null>;
};

function lerCampo(ctx: ContextoVenda, campo: string): unknown {
  switch (campo) {
    case "valor":
      return ctx.valor;
    case "recebido":
      return ctx.recebido;
    case "restante":
      return ctx.restante;
    case "faixaIndex":
      return ctx.faixaIndex;
    case "completo":
      return ctx.completo;
    case "cadeira":
      return ctx.cadeira;
    case "produtoId":
      return ctx.produtoId;
    default:
      return ctx.campos?.[campo];
  }
}

function comparar(atual: unknown, op: CondicaoRegra["op"], alvo: unknown): boolean {
  // `é` compara identidade sem coerção — é o operador para sim/não e texto.
  if (op === "é") return atual === alvo;
  if (op === "==") return atual == alvo; // eslint-disable-line eqeqeq
  if (op === "!=") return atual != alvo; // eslint-disable-line eqeqeq

  // Os relacionais só fazem sentido em número. Nulo/indefinido nunca passa:
  // "recebido >= 15000" com recebido em branco tem que ser falso, não erro.
  const a = typeof atual === "number" ? atual : Number(atual);
  const b = typeof alvo === "number" ? alvo : Number(alvo);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;

  switch (op) {
    case ">=":
      return a >= b;
    case "<=":
      return a <= b;
    case ">":
      return a > b;
    case "<":
      return a < b;
    default:
      return false;
  }
}

/** Todas as condições precisam passar (E lógico). Sem condição = passa. */
function condicoesPassam(ctx: ContextoVenda, condicoes?: CondicaoRegra[]): boolean {
  if (!condicoes?.length) return true;
  return condicoes.every((c) => comparar(lerCampo(ctx, c.campo), c.op, c.valor));
}

/** Soma de ponto flutuante em dinheiro/pontos: 0,1 + 0,2 não pode virar 0,30000000000000004. */
const arredonda = (n: number) => Math.round(n * 100) / 100;

function pontosDaRegra(regra: Regra, ctx: ContextoVenda): number {
  let pontos = 0;

  switch (regra.tipo) {
    case "base":
      pontos = regra.pontos;
      break;

    case "condicao":
      pontos = condicoesPassam(ctx, regra.condicoes) ? regra.pontos : 0;
      break;

    case "porFaixa": {
      if (ctx.faixaIndex === null) return 0;
      const tabela = regra.pontosPorFaixa ?? [];
      pontos = tabela[ctx.faixaIndex] ?? 0;
      break;
    }

    case "proporcional": {
      if (!condicoesPassam(ctx, regra.condicoes)) return 0;
      const divisor = regra.divisor ?? 0;
      if (!divisor) return 0; // divisor zerado não pontua (em vez de virar Infinity)
      const base = Number(lerCampo(ctx, regra.campoBase ?? "valor"));
      if (!Number.isFinite(base) || base <= 0) return 0;
      pontos = Math.floor(base / divisor) * regra.pontos;
      break;
    }
  }

  if (regra.teto !== undefined) {
    // O teto limita em módulo, para não inverter o sinal de uma regra negativa.
    pontos = pontos >= 0 ? Math.min(pontos, regra.teto) : Math.max(pontos, -regra.teto);
  }
  return arredonda(pontos);
}

export type ResultadoPontuacao = { total: number; detalhe: PontoDetalhe[] };

/**
 * Avalia as regras ATIVAS do evento contra uma venda.
 * O `detalhe` é o que fica gravado na venda — a pontuação é congelada no
 * registro para que mudar a regra depois não reescreva o ranking sozinho.
 */
export function calcularPontos(regras: Regra[], ctx: ContextoVenda): ResultadoPontuacao {
  const detalhe: PontoDetalhe[] = [];
  let total = 0;

  for (const regra of regras) {
    if (!regra.ativo) continue;
    const pontos = pontosDaRegra(regra, ctx);
    total += pontos;
    detalhe.push({ regraId: regra.id, label: regra.label, tag: regra.tag, pontos });
  }

  return { total: arredonda(total), detalhe };
}

/** Índice da faixa em que um valor cai — usado ao pré-selecionar no formulário. */
export function faixaDoValor(faixas: { min: number; max?: number }[], valor: number): number | null {
  const i = faixas.findIndex((f) => valor >= f.min && (f.max === undefined || valor <= f.max));
  return i === -1 ? null : i;
}
