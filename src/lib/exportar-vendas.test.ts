import { describe, expect, it } from "vitest";
import {
  linhasDetalhadas,
  linhasPorCloser,
  linhasRanking,
  linhasResumo,
  nomeDeAba,
  nomeDoArquivo,
} from "./exportar-vendas";
import type { Venda } from "./types";

const venda = (parcial: Partial<Venda>): Venda => ({
  id: "v1",
  eventoId: "e1",
  usuarioId: "u1",
  closerNome: "Ana",
  emailCloser: "ana@x.com",
  cliente: "Cliente",
  email: null,
  telefone: null,
  cpf: null,
  leadId: null,
  dataVenda: "2026-08-17",
  produto: "Produto",
  produtoId: "produto",
  valor: 10000,
  recebido: 5000,
  faixa: null,
  faixaLabel: "50%",
  cadeira: false,
  valorCadeira: 0,
  completo: false,
  restante: 5000,
  negociacao: null,
  observacao: null,
  pts: 1,
  pontosDetalhe: [],
  contrato: null,
  contratoEm: null,
  criadoEm: "2026-08-17T14:00:00Z",
  ...parcial,
});

describe("linhasRanking", () => {
  it("agrupa por closer somando pontos, vendas, recebido e volume", () => {
    const linhas = linhasRanking([
      venda({ id: "a", closerNome: "Ana", pts: 2, valor: 10000, recebido: 4000 }),
      venda({ id: "b", closerNome: "Ana", pts: 1, valor: 5000, recebido: 5000 }),
      venda({ id: "c", closerNome: "Beto", pts: 1, valor: 30000, recebido: 30000 }),
    ]);
    expect(linhas).toHaveLength(2);
    expect(linhas[0]).toMatchObject({
      "Posição": 1,
      "Closer": "Ana",
      "Pontos": 3,
      "Nº de Vendas": 2,
    });
    expect(linhas[0]["Total Recebido"]).toBe("R$ 9.000,00");
    expect(linhas[0]["Volume de Vendas"]).toBe("R$ 15.000,00");
  });

  it("desempata pontos iguais pelo maior recebido", () => {
    const linhas = linhasRanking([
      venda({ id: "a", closerNome: "Ana", pts: 1, recebido: 1000 }),
      venda({ id: "b", closerNome: "Beto", pts: 1, recebido: 9000 }),
    ]);
    expect(linhas[0]["Closer"]).toBe("Beto");
  });
});

describe("linhasResumo", () => {
  it("ordena da mais recente para a mais antiga", () => {
    const linhas = linhasResumo([
      venda({ id: "antiga", cliente: "Primeiro", criadoEm: "2026-08-17T10:00:00Z" }),
      venda({ id: "nova", cliente: "Segundo", criadoEm: "2026-08-17T18:00:00Z" }),
    ]);
    expect(linhas[0]["Cliente"]).toBe("Segundo");
  });

  it("formata data e dinheiro no padrão brasileiro", () => {
    const [l] = linhasResumo([venda({ dataVenda: "2026-08-17", valor: 25964 })]);
    expect(l["Data da venda"]).toBe("17/08/2026");
    expect(l["Valor da venda"]).toBe("R$ 25.964,00");
  });
});

describe("linhasDetalhadas", () => {
  it("traduz booleanos para Sim/Não e junta o detalhe dos pontos", () => {
    const [l] = linhasDetalhadas([
      venda({
        cadeira: true,
        completo: true,
        pontosDetalhe: [
          { regraId: "base", label: "Venda", tag: "base", pontos: 1 },
          { regraId: "bonus", label: "Completo", tag: "bonus", pontos: 0.5 },
        ],
      }),
    ]);
    expect(l["2ª cadeira"]).toBe("Sim");
    expect(l["Receb. completo"]).toBe("Sim");
    expect(l["Detalhe dos pontos"]).toBe("Venda: 1 · Completo: 0.5");
  });
});

describe("linhasPorCloser", () => {
  it("separa as vendas de cada closer na própria aba", () => {
    const abas = linhasPorCloser([
      venda({ id: "a", closerNome: "Ana" }),
      venda({ id: "b", closerNome: "Beto" }),
      venda({ id: "c", closerNome: "Ana" }),
    ]);
    expect(abas.map((a) => a.nome).sort()).toEqual(["Ana", "Beto"]);
    expect(abas.find((a) => a.nome === "Ana")?.linhas).toHaveLength(2);
  });
});

describe("nomeDeAba", () => {
  it("remove caracteres proibidos no Excel e limita a 31", () => {
    expect(nomeDeAba("Ana/Paula: [SP]*?")).toBe("Ana Paula   SP");
    expect(nomeDeAba("x".repeat(40))).toHaveLength(31);
  });
});

describe("nomeDoArquivo", () => {
  it("carimba prefixo, data e hora", () => {
    const nome = nomeDoArquivo("Cristina", new Date(2026, 7, 17, 19, 5));
    expect(nome).toBe("Cristina_Vendas_17-08-2026_1905.xlsx");
  });
});
