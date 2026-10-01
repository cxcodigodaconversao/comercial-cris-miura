import { describe, expect, it } from "vitest";
import { urlNovoContrato } from "./contrato-externo";
import type { Venda } from "./types";

const venda = (p: Partial<Venda> = {}): Venda => ({
  id: "v-123",
  eventoId: "e1",
  usuarioId: "u1",
  closerNome: "Ana",
  emailCloser: "ana@x.com",
  cliente: "Maria da Silva",
  email: "maria@exemplo.com",
  telefone: "(11) 99999-8888",
  cpf: "123.456.789-01",
  cep: "01310-100",
  leadId: null,
  dataVenda: "2026-09-03",
  produto: "Mentoria",
  produtoId: "mentoria",
  valor: 35000,
  recebido: 35000,
  faixa: null,
  faixaLabel: null,
  cadeira: false,
  valorCadeira: 0,
  completo: true,
  restante: 0,
  negociacao: null,
  observacao: null,
  pts: 2,
  pontosDetalhe: [],
  contrato: null,
  contratoEm: null,
  criadoEm: "2026-09-03T12:00:00Z",
  ...p,
});

describe("urlNovoContrato", () => {
  it("monta a URL de /novo com os dados da venda", () => {
    const url = new URL(urlNovoContrato("https://site.com/assinatura-dex", venda()));
    expect(url.pathname).toBe("/assinatura-dex/novo");
    expect(url.searchParams.get("nome")).toBe("Maria da Silva");
    expect(url.searchParams.get("email")).toBe("maria@exemplo.com");
    expect(url.searchParams.get("valor")).toBe("35000");
    expect(url.searchParams.get("venda_id")).toBe("v-123");
  });

  it("manda CPF e telefone só com dígitos", () => {
    const url = new URL(urlNovoContrato("https://site.com/x", venda()));
    expect(url.searchParams.get("cpf")).toBe("12345678901");
    expect(url.searchParams.get("telefone")).toBe("11999998888");
    expect(url.searchParams.get("cep")).toBe("01310100");
  });

  it("2ª cadeira vira DUPLA; sem ela, INDIVIDUAL", () => {
    expect(new URL(urlNovoContrato("https://s.com", venda({ cadeira: true }))).searchParams.get("modalidade")).toBe("DUPLA");
    expect(new URL(urlNovoContrato("https://s.com", venda({ cadeira: false }))).searchParams.get("modalidade")).toBe("INDIVIDUAL");
  });

  it("recebimento completo vira VISTA; parcial vira PRAZO", () => {
    expect(new URL(urlNovoContrato("https://s.com", venda({ completo: true }))).searchParams.get("forma")).toBe("VISTA");
    expect(new URL(urlNovoContrato("https://s.com", venda({ completo: false }))).searchParams.get("forma")).toBe("PRAZO");
  });

  it("omite campos vazios e tolera barra no fim do link", () => {
    const url = new URL(urlNovoContrato("https://s.com/app///", venda({ cpf: null, email: null, telefone: null, cep: null })));
    expect(url.pathname).toBe("/app/novo");
    expect(url.searchParams.has("cpf")).toBe(false);
    expect(url.searchParams.has("email")).toBe(false);
    expect(url.searchParams.has("telefone")).toBe(false);
    expect(url.searchParams.has("cep")).toBe(false);
  });
});
