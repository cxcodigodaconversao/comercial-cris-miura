import { describe, expect, it } from "vitest";
import { calcularAnalise, extrairInscritosDoPainel, normalizarLinha } from "./analise";
import type { Venda } from "./types";

const linha = (p: Record<string, unknown> = {}) => ({
  nome: "Maria",
  email: "Maria@Exemplo.com ",
  classe: "AA",
  nota: 90.0,
  perfil: 85.0,
  comprometimento: 100.0,
  ja_aluno: "Sim",
  faturamento: "Acima de R$ 40.000",
  checkin_feito: true,
  d1: true,
  d2: true,
  d3: false,
  ligou: false,
  resultado_ligacao: null,
  contato_confirmou: "Confirmou",
  utm_source: "instagram",
  ...p,
});

const venda = (email: string, valor = 35000): Venda =>
  ({
    id: Math.random().toString(36).slice(2),
    email,
    valor,
    cliente: "x",
  }) as unknown as Venda;

describe("normalizarLinha", () => {
  it("normaliza e-mail, converte tipos e guarda o resto em extras", () => {
    const i = normalizarLinha(linha())!;
    expect(i.email).toBe("maria@exemplo.com");
    expect(i.classe).toBe("AA");
    expect(i.jaAluno).toBe(true);
    expect(i.checkinFeito).toBe(true);
    expect(i.d3).toBe(false);
    expect(i.extras.utm_source).toBe("instagram");
    expect(i.extras.nome).toBeUndefined();
  });

  it("descarta linha sem e-mail e trata classe desconhecida como X", () => {
    expect(normalizarLinha(linha({ email: "" }))).toBeNull();
    expect(normalizarLinha(linha({ classe: "ZZ" }))!.classe).toBe("X");
  });
});

describe("extrairInscritosDoPainel", () => {
  it("lê o JSON embutido no index.html do painel", () => {
    const html = `<html><script id="data" type="application/json">${JSON.stringify({
      rows: [linha(), linha({ email: "b@x.com", classe: "B" }), { nome: "sem email" }],
      agg: {},
    })}</script><script>app()</script></html>`;
    const { inscritos, descartados } = extrairInscritosDoPainel(html);
    expect(inscritos).toHaveLength(2);
    expect(descartados).toBe(1);
  });

  it("aceita um .json puro e dedup por e-mail (última vence)", () => {
    const { inscritos } = extrairInscritosDoPainel(
      JSON.stringify([linha({ classe: "C" }), linha({ classe: "AA" })])
    );
    expect(inscritos).toHaveLength(1);
    expect(inscritos[0].classe).toBe("AA");
  });

  it("erra com mensagem clara se o arquivo não for o painel", () => {
    expect(() => extrairInscritosDoPainel("<html>oi</html>")).toThrow(/index\.html/);
  });
});

describe("calcularAnalise", () => {
  const base = [
    normalizarLinha(linha({ email: "aa1@x.com", classe: "AA" }))!,
    normalizarLinha(linha({ email: "aa2@x.com", classe: "AA" }))!,
    normalizarLinha(linha({ email: "b1@x.com", classe: "B", checkin_feito: false, d1: false, d2: false }))!,
    normalizarLinha(linha({ email: "x1@x.com", classe: "X", nota: null, ja_aluno: null }))!,
  ];

  it("conta classes, MQL e check-in", () => {
    const a = calcularAnalise(base, []);
    expect(a.total).toBe(4);
    expect(a.comNota).toBe(3);
    expect(a.mqlTop).toBe(3); // AA+A+B
    expect(a.mqlAmplo).toBe(3); // + C (nenhum)
    expect(a.pctMqlTop).toBe(100);
    expect(a.checkin.feito).toBe(3);
    expect(a.checkin.pctFeito).toBe(75);
  });

  it("cruza inscritos com vendas por e-mail e calcula conversão por classe", () => {
    const a = calcularAnalise(base, [
      venda("AA1@x.com"),          // casa (case-insensitive)
      venda("b1@x.com", 20000),    // casa
      venda("ninguem@x.com"),      // não está na base
    ]);
    expect(a.compraram).toBe(2);
    expect(a.vendasSemInscricao).toBe(1);
    expect(a.conversaoGeral).toBe(50);
    expect(a.volumeInscritos).toBe(55000);
    const aa = a.porClasse.find((c) => c.classe === "AA")!;
    expect(aa.vendas).toBe(1);
    expect(aa.conversao).toBe(50);
    const b = a.porClasse.find((c) => c.classe === "B")!;
    expect(b.conversao).toBe(100);
  });

  it("duas vendas do mesmo inscrito contam uma conversão", () => {
    const a = calcularAnalise(base, [venda("aa1@x.com"), venda("aa1@x.com")]);
    expect(a.compraram).toBe(1);
  });

  it("ordena faturamento na ordem das faixas, não por frequência", () => {
    const a = calcularAnalise(
      [
        normalizarLinha(linha({ email: "1@x", faturamento: "Acima de R$ 40.000" }))!,
        normalizarLinha(linha({ email: "2@x", faturamento: "Acima de R$ 40.000" }))!,
        normalizarLinha(linha({ email: "3@x", faturamento: "Menos de R$ 5.000,01" }))!,
      ],
      []
    );
    expect(a.faturamento.map((f) => f.label)).toEqual(["Menos de R$ 5.000,01", "Acima de R$ 40.000"]);
  });
});
