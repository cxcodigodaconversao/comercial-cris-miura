import { describe, expect, it } from "vitest";
import {
  descreverParaIA,
  diferenca,
  dividir,
  podeGerar,
  somaDoPlano,
  validar,
  valorDaParcela,
  type Parcela,
  type Plano,
} from "./parcelamento";

const parcela = (over: Partial<Parcela> = {}): Parcela => ({
  valor: 1000,
  forma: "PIX",
  quando: "data",
  data: "2026-09-15",
  ...over,
});

const plano = (over: Partial<Plano> = {}): Plano => ({
  valorTotal: 10000,
  entrada: { valor: 4000, forma: "PIX", data: "2026-08-14" },
  parcelas: [parcela({ valor: 6000 })],
  ...over,
});

describe("soma e diferença", () => {
  it("soma entrada e parcelas", () => {
    expect(somaDoPlano(plano())).toBe(10000);
    expect(diferenca(plano())).toBe(0);
  });

  it("acusa o que falta", () => {
    expect(diferenca(plano({ parcelas: [parcela({ valor: 5000 })] }))).toBe(1000);
  });

  it("acusa o que passou, com sinal negativo", () => {
    expect(diferenca(plano({ parcelas: [parcela({ valor: 7000 })] }))).toBe(-1000);
  });

  it("centavos não geram diferença fantasma", () => {
    // 0,1 + 0,2 em float dá 0.30000000000000004; em centavos, não.
    const p = plano({
      valorTotal: 0.3,
      entrada: undefined,
      parcelas: [parcela({ valor: 0.1 }), parcela({ valor: 0.2 })],
    });
    expect(diferenca(p)).toBe(0);
    expect(podeGerar(p)).toBe(true);
  });
});

describe("dividir", () => {
  it("divide certo quando é exato", () => {
    expect(dividir(900, 3)).toEqual([300, 300, 300]);
  });

  it("a ÚLTIMA parcela absorve os centavos", () => {
    // 25.964 / 3 = 8654,666… Arredondar cada uma daria 25.964,01 e o plano
    // acusaria erro de um centavo, que ninguém entende.
    const partes = dividir(25964, 3);
    expect(partes).toEqual([8654.66, 8654.66, 8654.68]);
    expect(partes.reduce((a, b) => a + b, 0)).toBeCloseTo(25964, 2);
  });

  it("a soma sempre fecha, para qualquer divisão", () => {
    for (const n of [2, 3, 6, 7, 12, 13]) {
      const soma = dividir(35964, n).reduce((a, b) => Math.round((a + b) * 100) / 100, 0);
      expect(soma).toBe(35964);
    }
  });

  it("uma parcela só devolve o valor inteiro", () => {
    expect(dividir(1234.56, 1)).toEqual([1234.56]);
  });
});

describe("dois cartões", () => {
  const doisCartoes = (c1: number, c2: number) =>
    parcela({
      valor: 0, // ignorado de propósito: o valor é derivado
      forma: "2 cartões de crédito",
      cartao1: { valor: c1, vezes: 12 },
      cartao2: { valor: c2, vezes: 10 },
    });

  it("o valor da parcela é a soma dos dois cartões, não o campo digitado", () => {
    expect(valorDaParcela(doisCartoes(3000, 2000))).toBe(5000);
  });

  it("entra na soma do plano pelo valor derivado", () => {
    const p = plano({ valorTotal: 5000, entrada: undefined, parcelas: [doisCartoes(3000, 2000)] });
    expect(somaDoPlano(p)).toBe(5000);
    expect(podeGerar(p)).toBe(true);
  });

  it("bloqueia se um dos cartões estiver zerado", () => {
    const p = plano({ valorTotal: 3000, entrada: undefined, parcelas: [doisCartoes(3000, 0)] });
    expect(validar(p).some((x) => x.mensagem.includes("dois cartões"))).toBe(true);
    expect(podeGerar(p)).toBe(false);
  });
});

describe("validação", () => {
  it("plano fechado passa", () => {
    expect(podeGerar(plano())).toBe(true);
  });

  it("bloqueia quando falta valor, dizendo quanto", () => {
    const p = plano({ parcelas: [parcela({ valor: 5000 })] });
    const soma = validar(p).find((x) => x.campo === "soma");
    expect(soma?.bloqueia).toBe(true);
    expect(soma?.mensagem).toContain("Faltam R$ 1.000,00");
  });

  it("bloqueia quando passa do total", () => {
    const p = plano({ parcelas: [parcela({ valor: 7000 })] });
    expect(validar(p).find((x) => x.campo === "soma")?.mensagem).toContain("passa R$ 1.000,00");
  });

  it("bloqueia parcela zerada", () => {
    const p = plano({
      valorTotal: 4000,
      parcelas: [parcela({ valor: 0 })],
    });
    expect(validar(p).some((x) => x.mensagem.includes("sem valor"))).toBe(true);
  });

  it("bloqueia entrada maior que o total", () => {
    const p = plano({ valorTotal: 1000, entrada: { valor: 5000, forma: "PIX" }, parcelas: [] });
    expect(validar(p).some((x) => x.campo === "entrada" && x.bloqueia)).toBe(true);
  });

  it("bloqueia plano sem nada lançado", () => {
    const p = plano({ entrada: undefined, parcelas: [] });
    expect(validar(p).some((x) => x.campo === "plano" && x.bloqueia)).toBe(true);
  });

  it("bloqueia parcela por data sem data", () => {
    const p = plano({ parcelas: [parcela({ valor: 6000, quando: "data", data: undefined })] });
    expect(validar(p).some((x) => x.mensagem.includes("informe a data"))).toBe(true);
  });

  it("bloqueia parcela por dias sem o número de dias", () => {
    const p = plano({ parcelas: [parcela({ valor: 6000, quando: "dias", dias: undefined })] });
    expect(validar(p).some((x) => x.mensagem.includes("quantos dias"))).toBe(true);
  });

  it("datas fora de ordem AVISAM, sem bloquear — às vezes é intencional", () => {
    const p = plano({
      valorTotal: 12000,
      entrada: undefined,
      parcelas: [
        parcela({ valor: 6000, data: "2026-10-10" }),
        parcela({ valor: 6000, data: "2026-09-10" }),
      ],
    });
    const aviso = validar(p).find((x) => x.campo === "ordem");
    expect(aviso?.bloqueia).toBe(false);
    expect(podeGerar(p)).toBe(true);
  });
});

describe("descreverParaIA", () => {
  it("descreve entrada e parcela com forma e data", () => {
    const texto = descreverParaIA(plano({ cliente: "Diego Souza" }));
    expect(texto).toContain("Cliente: Diego Souza");
    expect(texto).toContain("Valor total: R$ 10.000,00");
    expect(texto).toContain("Entrada: R$ 4.000,00 via PIX em 14/08/2026");
    expect(texto).toContain("Parcela 1: R$ 6.000,00 — PIX — 15/09/2026");
  });

  it("descreve cartão com o número de vezes", () => {
    const p = plano({
      entrada: undefined,
      valorTotal: 6000,
      parcelas: [parcela({ valor: 6000, forma: "Cartão de crédito", vezes: 12 })],
    });
    expect(descreverParaIA(p)).toContain("12x no cartão de crédito");
  });

  it("descreve os dois cartões separadamente", () => {
    const p = plano({
      entrada: undefined,
      valorTotal: 5000,
      parcelas: [
        parcela({
          forma: "2 cartões de crédito",
          cartao1: { valor: 3000, vezes: 12 },
          cartao2: { valor: 2000, vezes: 6 },
        }),
      ],
    });
    const texto = descreverParaIA(p);
    expect(texto).toContain("R$ 3.000,00 em 12x no primeiro cartão");
    expect(texto).toContain("R$ 2.000,00 em 6x no segundo cartão");
  });

  it("descreve prazo em dias", () => {
    const p = plano({
      entrada: undefined,
      valorTotal: 1000,
      parcelas: [parcela({ valor: 1000, quando: "dias", dias: 30 })],
    });
    expect(descreverParaIA(p)).toContain("30 dias após a assinatura");
  });

  it("plano avulso não precisa de cliente", () => {
    const texto = descreverParaIA(plano({ cliente: undefined }));
    expect(texto).not.toContain("Cliente:");
    expect(texto).toContain("Valor total:");
  });
});
