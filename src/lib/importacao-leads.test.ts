import { describe, expect, it } from "vitest";
import { erroDeEstrutura, interpretarPlanilha, mapearColunas, vazio } from "./importacao-leads";

/** Linha no formato real da exportação de participantes. */
const linha = (over: Record<string, unknown> = {}) => ({
  Nome: "Fulano de Tal",
  CPF: "123.456.789-00",
  Telefone: "5521999999999",
  Email: "fulano@exemplo.com",
  Origem: "Forms",
  "Status Inscrição": "Inscrito",
  Classificação: "Convidado(a)",
  Ingresso: "Enviado",
  eTicket: "1448785343413951327",
  ...over,
});

describe("vazio", () => {
  it("trata o travessão da planilha como ausência de valor", () => {
    // A exportação usa "—" no lugar de célula em branco; sem isso o CPF de
    // metade da base entraria no banco como o texto "—".
    expect(vazio("—")).toBe(true);
    expect(vazio("-")).toBe(true);
    expect(vazio("n/a")).toBe(true);
    expect(vazio("")).toBe(true);
    expect(vazio(null)).toBe(true);
    expect(vazio("0")).toBe(false);
    expect(vazio("Fulano")).toBe(false);
  });
});

describe("mapearColunas", () => {
  it("encontra as colunas da exportação real", () => {
    const { mapa } = mapearColunas(["Nome", "CPF", "Telefone", "Email", "Classificação", "eTicket"]);
    expect(mapa.codigoCracha).toBe("eTicket");
    expect(mapa.nome).toBe("Nome");
    expect(mapa.tipo).toBe("Classificação");
  });

  it("ignora acento, caixa e pontuação no cabeçalho", () => {
    const { mapa } = mapearColunas(["NOME", "E-Mail", "Código", "Classificacao"]);
    expect(mapa.nome).toBe("NOME");
    expect(mapa.email).toBe("E-Mail");
    expect(mapa.codigoCracha).toBe("Código");
    expect(mapa.tipo).toBe("Classificacao");
  });

  it("relata colunas que não reconhece, em vez de descartar em silêncio", () => {
    const { desconhecidas } = mapearColunas(["Nome", "eTicket", "NPS D1", "Motivo"]);
    expect(desconhecidas).toContain("NPS D1");
    expect(desconhecidas).toContain("Motivo");
  });
});

describe("interpretarPlanilha", () => {
  it("importa a linha completa", () => {
    const r = interpretarPlanilha([linha()]);
    expect(r.leads).toHaveLength(1);
    expect(r.leads[0]).toMatchObject({
      codigoCracha: "1448785343413951327",
      nome: "Fulano de Tal",
      cpf: "123.456.789-00",
      tipo: "Convidado(a)",
      status: "novo",
    });
  });

  it("ignora quem não tem crachá, dizendo o motivo e a linha", () => {
    const r = interpretarPlanilha([linha(), linha({ Nome: "Sem Ticket", eTicket: "—" })]);
    expect(r.leads).toHaveLength(1);
    expect(r.ignoradas).toEqual([
      { linha: 3, nome: "Sem Ticket", motivo: "sem código de crachá — não dá para ler por QR" },
    ]);
  });

  it("a linha informada bate com a do Excel (cabeçalho é a 1)", () => {
    const r = interpretarPlanilha([linha({ eTicket: "—" })]);
    expect(r.ignoradas[0].linha).toBe(2);
  });

  it("converte o travessão em nulo em vez de gravar o texto", () => {
    const r = interpretarPlanilha([linha({ CPF: "—", Telefone: "—" })]);
    expect(r.leads[0].cpf).toBeNull();
    expect(r.leads[0].telefone).toBeNull();
  });

  it("aponta crachá repetido entre pessoas diferentes", () => {
    const r = interpretarPlanilha([
      linha({ Nome: "Um", eTicket: "999" }),
      linha({ Nome: "Outro", eTicket: "999" }),
    ]);
    expect(r.duplicadas).toEqual([{ codigoCracha: "999", nomes: ["Um", "Outro"] }]);
  });
});

describe("erroDeEstrutura", () => {
  it("passa quando a planilha está boa", () => {
    expect(erroDeEstrutura(interpretarPlanilha([linha()]))).toBeNull();
  });

  it("recusa planilha sem coluna de crachá", () => {
    const r = interpretarPlanilha([{ Nome: "Fulano", Email: "a@b.c" }]);
    expect(erroDeEstrutura(r)).toMatch(/código do crachá/i);
  });

  it("recusa planilha vazia", () => {
    expect(erroDeEstrutura(interpretarPlanilha([]))).toMatch(/vazia/i);
  });

  it("recusa quando nenhuma linha tem crachá", () => {
    const r = interpretarPlanilha([linha({ eTicket: "—" }), linha({ eTicket: null })]);
    expect(erroDeEstrutura(r)).toMatch(/nenhuma linha/i);
  });

  it("BLOQUEIA crachá duplicado — mandaria a venda para o lead errado", () => {
    const r = interpretarPlanilha([
      linha({ Nome: "Um", eTicket: "999" }),
      linha({ Nome: "Outro", eTicket: "999" }),
    ]);
    expect(erroDeEstrutura(r)).toMatch(/repetido/i);
  });
});
