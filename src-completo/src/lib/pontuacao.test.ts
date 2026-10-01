import { describe, expect, it } from "vitest";
import { calcularPontos, faixaDoValor, type ContextoVenda } from "./pontuacao";
import { FAIXAS_PADRAO, REGRAS_PADRAO } from "./config";
import type { Regra } from "./types";

/**
 * O contrato mais importante deste arquivo é o primeiro bloco: a tabela de
 * pontos por faixa PRECISA bater exatamente com o combinado com o cliente,
 * senão a pontuação (e a comissão) de todo mundo muda.
 *
 * Regra vigente (ticket de R$ 35.000):
 *   · faixa 0 — abaixo de R$ 15.000 .............. 1 ponto
 *   · faixa 1 — R$ 15.000 até R$ 35.963 .......... 2 pontos
 *   · faixa 2 — acima de R$ 35.963 ............... 3 pontos
 *   · 2ª cadeira ................................. +0,5
 *
 * Os pontos de faixa NÃO se somam entre si: a faixa define o valor, e a 2ª
 * cadeira é o único acréscimo.
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

/** A tabela combinada, escrita à mão para comparar contra o motor. */
function pontosEsperados(faixa: number | null, cadeira: boolean | null) {
  const porFaixa = faixa === null ? 0 : [1, 2, 3][faixa] ?? 0;
  return porFaixa + (cadeira ? 0.5 : 0);
}

describe("tabela de pontos por faixa", () => {
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
          expect(total).toBe(pontosEsperados(f, cad));
        });
      }
    }
  }

  it("cada faixa vale 1, 2 e 3 pontos", () => {
    const pts = (faixaIndex: number) =>
      calcularPontos(REGRAS_PADRAO, ctx({ faixaIndex })).total;
    expect(pts(0)).toBe(1);
    expect(pts(1)).toBe(2);
    expect(pts(2)).toBe(3);
  });

  it("o recebimento completo não altera a pontuação", () => {
    const semCompleto = calcularPontos(REGRAS_PADRAO, ctx({ faixaIndex: 1 })).total;
    const comCompleto = calcularPontos(
      REGRAS_PADRAO,
      ctx({ faixaIndex: 1, completo: true })
    ).total;
    expect(comCompleto).toBe(semCompleto);
  });

  it("venda sem faixa definida não pontua pela tabela", () => {
    const { total } = calcularPontos(REGRAS_PADRAO, ctx({ faixaIndex: null }));
    expect(total).toBe(0);
  });

  it("a venda máxima dá 3,5 pontos", () => {
    const { total } = calcularPontos(
      REGRAS_PADRAO,
      ctx({ faixaIndex: 2, cadeira: true })
    );
    expect(total).toBe(3.5);
  });

  it("mostra os dois selos no detalhe, mesmo o que não pontuou", () => {
    const { detalhe } = calcularPontos(REGRAS_PADRAO, ctx({ faixaIndex: 0 }));
    expect(detalhe).toHaveLength(2);
    expect(detalhe.map((d) => d.pontos)).toEqual([1, 0]);
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
    const r = REGRAS_PADRAO.map((x) => (x.id === "faixa" ? { ...x, ativo: false } : x));
    const res = calcularPontos(r, ctx({ faixaIndex: 2, completo: true, cadeira: true }));
    expect(res.total).toBe(0.5);
    expect(res.detalhe.find((d) => d.regraId === "faixa")).toBeUndefined();
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
    // As bordas do combinado: 35.963 ainda é faixa do meio; 1 centavo acima já sobe.
    expect(faixaDoValor(FAIXAS_PADRAO, 35000)).toBe(1);
    expect(faixaDoValor(FAIXAS_PADRAO, 35963)).toBe(1);
    expect(faixaDoValor(FAIXAS_PADRAO, 35963.01)).toBe(2);
    expect(faixaDoValor(FAIXAS_PADRAO, 500000)).toBe(2);
  });

  it("devolve null quando o valor não cai em nenhuma faixa", () => {
    expect(faixaDoValor([{ min: 100, max: 200 }], 50)).toBeNull();
  });
});
