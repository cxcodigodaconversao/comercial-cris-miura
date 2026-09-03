import { describe, expect, it } from "vitest";
import { calcularPontos, faixaDoValor, type ContextoVenda } from "./pontuacao";
import { FAIXAS_PADRAO, REGRAS_PADRAO } from "./config";
import type { Regra } from "./types";

/**
 * O contrato mais importante deste arquivo é o primeiro bloco: as regras
 * configuráveis PRECISAM devolver exatamente o que a getPts() da v1 devolvia,
 * senão a migração muda a pontuação (e a comissão) de todo mundo.
 *
 * getPts original:
 *   total = 1 + (faixa >= 1 ? 1 : 0) + (completo ? 1 : 0) + (cadeira ? 0.5 : 0)
 */

function ctx(p: Partial<ContextoVenda> = {}): ContextoVenda {
  return {
    valor: 0,
    recebido: 0,
    restante: 0,
    faixaIndex: null,
    completo: null,
    cadeira: null,
    ...p,
  };
}

/** Reimplementação literal da v1, para comparar contra o motor novo. */
function getPtsV1(faixa: number | null, completo: boolean | null, cadeira: boolean | null) {
  return 1 + (faixa !== null && faixa >= 1 ? 1 : 0) + (completo ? 1 : 0) + (cadeira ? 0.5 : 0);
}

describe("paridade com a pontuação da v1", () => {
  const faixas = [null, 0, 1, 2];
  const simNao = [null, true, false];

  for (const f of faixas) {
    for (const c of simNao) {
      for (const cad of simNao) {
        it(`faixa=${f} completo=${c} cadeira=${cad}`, () => {
          const { total } = calcularPontos(
            REGRAS_PADRAO,
            ctx({ faixaIndex: f, completo: c, cadeira: cad })
          );
          expect(total).toBe(getPtsV1(f, c, cad));
        });
      }
    }
  }

  it("cobre os 4 selos no detalhe, mesmo os que não pontuaram", () => {
    const { detalhe } = calcularPontos(REGRAS_PADRAO, ctx({ faixaIndex: 0 }));
    expect(detalhe).toHaveLength(4);
    expect(detalhe.map((d) => d.pontos)).toEqual([1, 0, 0, 0]);
  });

  it("a venda máxima da v1 dá 3,5 pontos", () => {
    const { total } = calcularPontos(
      REGRAS_PADRAO,
      ctx({ faixaIndex: 2, completo: true, cadeira: true })
    );
    expect(total).toBe(3.5);
  });
});

describe("operadores de condição", () => {
  const regra = (op: Regra["condicoes"] extends undefined ? never : string, valor: unknown): Regra[] => [
    {
      id: "r",
      label: "r",
      tag: "+1",
      pontos: 1,
      tipo: "condicao",
      condicoes: [{ campo: "recebido", op: op as never, valor: valor as never }],
      ativo: true,
    },
  ];

  it(">= compara número", () => {
    expect(calcularPontos(regra(">=", 15000), ctx({ recebido: 15000 })).total).toBe(1);
    expect(calcularPontos(regra(">=", 15000), ctx({ recebido: 14999 })).total).toBe(0);
  });

  it("campo em branco nunca passa num relacional (não vira erro nem 0 >= 0)", () => {
    const semRecebido = ctx();
    semRecebido.recebido = undefined as unknown as number;
    expect(calcularPontos(regra(">", 0), semRecebido).total).toBe(0);
  });

  it("`é` compara sem coerção", () => {
    const r: Regra[] = [
      {
        id: "r",
        label: "r",
        tag: "+1",
        pontos: 1,
        tipo: "condicao",
        condicoes: [{ campo: "completo", op: "é", valor: true }],
        ativo: true,
      },
    ];
    expect(calcularPontos(r, ctx({ completo: true })).total).toBe(1);
    expect(calcularPontos(r, ctx({ completo: false })).total).toBe(0);
    expect(calcularPontos(r, ctx({ completo: null })).total).toBe(0);
  });

  it("todas as condições precisam passar (E lógico)", () => {
    const r: Regra[] = [
      {
        id: "r",
        label: "r",
        tag: "+2",
        pontos: 2,
        tipo: "condicao",
        condicoes: [
          { campo: "valor", op: ">=", valor: 30000 },
          { campo: "completo", op: "é", valor: true },
        ],
        ativo: true,
      },
    ];
    expect(calcularPontos(r, ctx({ valor: 30000, completo: true })).total).toBe(2);
    expect(calcularPontos(r, ctx({ valor: 30000, completo: false })).total).toBe(0);
    expect(calcularPontos(r, ctx({ valor: 100, completo: true })).total).toBe(0);
  });
});

describe("regra proporcional", () => {
  const proporcional = (divisor: number, teto?: number): Regra[] => [
    {
      id: "p",
      label: "1 pt a cada R$ 10.000",
      tag: "+1/10k",
      pontos: 1,
      tipo: "proporcional",
      campoBase: "recebido",
      divisor,
      teto,
      ativo: true,
    },
  ];

  it("conta apenas os blocos inteiros", () => {
    expect(calcularPontos(proporcional(10000), ctx({ recebido: 25000 })).total).toBe(2);
    expect(calcularPontos(proporcional(10000), ctx({ recebido: 9999 })).total).toBe(0);
  });

  it("respeita o teto", () => {
    expect(calcularPontos(proporcional(10000, 3), ctx({ recebido: 100000 })).total).toBe(3);
  });

  it("divisor zerado não gera Infinity", () => {
    expect(calcularPontos(proporcional(0), ctx({ recebido: 50000 })).total).toBe(0);
  });
});

describe("regra por faixa", () => {
  const porFaixa: Regra[] = [
    {
      id: "f",
      label: "Bônus por faixa",
      tag: "+",
      pontos: 0,
      tipo: "porFaixa",
      pontosPorFaixa: [0, 1, 2.5],
      ativo: true,
    },
  ];

  it("usa a tabela por índice", () => {
    expect(calcularPontos(porFaixa, ctx({ faixaIndex: 2 })).total).toBe(2.5);
    expect(calcularPontos(porFaixa, ctx({ faixaIndex: 0 })).total).toBe(0);
  });

  it("sem faixa escolhida não pontua", () => {
    expect(calcularPontos(porFaixa, ctx({ faixaIndex: null })).total).toBe(0);
  });

  it("índice fora da tabela não quebra", () => {
    expect(calcularPontos(porFaixa, ctx({ faixaIndex: 9 })).total).toBe(0);
  });
});

describe("higiene do motor", () => {
  it("regra inativa não entra nem no total nem no detalhe", () => {
    const r = REGRAS_PADRAO.map((x) => (x.id === "base" ? { ...x, ativo: false } : x));
    const res = calcularPontos(r, ctx({ faixaIndex: 2, completo: true, cadeira: true }));
    expect(res.total).toBe(2.5);
    expect(res.detalhe.find((d) => d.regraId === "base")).toBeUndefined();
  });

  it("campo desconhecido não pontua e não lança", () => {
    const r: Regra[] = [
      {
        id: "x",
        label: "x",
        tag: "+1",
        pontos: 1,
        tipo: "condicao",
        condicoes: [{ campo: "campo_que_nao_existe", op: ">=", valor: 1 }],
        ativo: true,
      },
    ];
    expect(() => calcularPontos(r, ctx())).not.toThrow();
    expect(calcularPontos(r, ctx()).total).toBe(0);
  });

  it("soma fracionária não vaza ponto flutuante", () => {
    const meios: Regra[] = Array.from({ length: 3 }, (_, i) => ({
      id: `m${i}`,
      label: "meio",
      tag: "+½",
      pontos: 0.1,
      tipo: "base" as const,
      ativo: true,
    }));
    expect(calcularPontos(meios, ctx()).total).toBe(0.3);
  });

  it("pontuação negativa é suportada (penalidade)", () => {
    const r: Regra[] = [
      { id: "b", label: "base", tag: "1", pontos: 1, tipo: "base", ativo: true },
      {
        id: "pen",
        label: "Sem recebimento",
        tag: "−1",
        pontos: -1,
        tipo: "condicao",
        condicoes: [{ campo: "recebido", op: "<=", valor: 0 }],
        ativo: true,
      },
    ];
    expect(calcularPontos(r, ctx({ recebido: 0 })).total).toBe(0);
  });
});

describe("faixaDoValor", () => {
  it("encontra a faixa do valor nas faixas padrão", () => {
    expect(faixaDoValor(FAIXAS_PADRAO, 0)).toBe(0);
    expect(faixaDoValor(FAIXAS_PADRAO, 14999)).toBe(0);
    expect(faixaDoValor(FAIXAS_PADRAO, 15000)).toBe(1);
    expect(faixaDoValor(FAIXAS_PADRAO, 29997)).toBe(2);
    expect(faixaDoValor(FAIXAS_PADRAO, 500000)).toBe(2);
  });

  it("devolve null quando o valor não cai em nenhuma faixa", () => {
    expect(faixaDoValor([{ min: 100, max: 200 }], 50)).toBeNull();
  });
});
