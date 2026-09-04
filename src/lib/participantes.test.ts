import { describe, expect, it } from "vitest";
import { normalizarLinha } from "./analise";
import {
  detalhesDe,
  filtrarParticipantes,
  linkInstagram,
  linkWhatsapp,
  ordenarParticipantes,
  semAcento,
} from "./participantes";

const p = (over: Record<string, unknown> = {}) =>
  normalizarLinha({
    nome: "José da Conceição",
    email: "jose@exemplo.com",
    whatsapp: "5531987818683",
    classe: "AA",
    nota: 90,
    instagram: "tupynambaodontologia",
    cro: "MG 23926",
    ...over,
  })!;

describe("semAcento", () => {
  it("tira acento e caixa", () => {
    expect(semAcento("  José DA Conceição ")).toBe("jose da conceicao");
  });
});

describe("filtrarParticipantes", () => {
  const lista = [
    p(),
    p({ nome: "Ana Paula Silva", email: "ana@x.com", whatsapp: "(31) 99999-1234", instagram: null }),
    p({ nome: "Ana Beatriz Souza", email: "beatriz@x.com", whatsapp: null, instagram: null }),
  ];

  it("acha mesmo digitando sem acento", () => {
    expect(filtrarParticipantes(lista, "jose").map((i) => i.nome)).toEqual(["José da Conceição"]);
    expect(filtrarParticipantes(lista, "CONCEICAO")).toHaveLength(1);
  });

  it("exige todas as palavras, não qualquer uma", () => {
    expect(filtrarParticipantes(lista, "ana")).toHaveLength(2);
    expect(filtrarParticipantes(lista, "ana silva").map((i) => i.nome)).toEqual(["Ana Paula Silva"]);
  });

  it("busca por e-mail, instagram e telefone com ou sem máscara", () => {
    expect(filtrarParticipantes(lista, "beatriz@x.com")).toHaveLength(1);
    expect(filtrarParticipantes(lista, "tupynamba")).toHaveLength(1);
    expect(filtrarParticipantes(lista, "31999991234")).toHaveLength(1);
  });

  it("termo vazio devolve a lista inteira", () => {
    expect(filtrarParticipantes(lista, "   ")).toHaveLength(3);
  });
});

describe("linkWhatsapp", () => {
  it("acrescenta o 55 quando falta e limpa a máscara", () => {
    expect(linkWhatsapp("(31) 98781-8683")).toBe("https://wa.me/5531987818683");
    expect(linkWhatsapp("3132221234")).toBe("https://wa.me/553132221234");
  });

  it("mantém número que já tem DDI", () => {
    expect(linkWhatsapp("5531987818683")).toBe("https://wa.me/5531987818683");
  });

  it("devolve null para vazio ou número curto demais", () => {
    expect(linkWhatsapp(null)).toBeNull();
    expect(linkWhatsapp("98781")).toBeNull();
  });
});

describe("linkInstagram", () => {
  it("aceita usuário, @usuario e URL completa", () => {
    expect(linkInstagram("perfil.teste")).toBe("https://instagram.com/perfil.teste");
    expect(linkInstagram("@perfil")).toBe("https://instagram.com/perfil");
    expect(linkInstagram("https://www.instagram.com/perfil/?hl=pt")).toBe("https://instagram.com/perfil");
  });

  it("devolve null para vazio ou lixo", () => {
    expect(linkInstagram(null)).toBeNull();
    expect(linkInstagram("não tenho")).toBeNull();
  });
});

describe("ordenarParticipantes", () => {
  it("melhor classe primeiro, depois maior nota", () => {
    const lista = [
      p({ nome: "C1", email: "c@x", classe: "C", nota: 60 }),
      p({ nome: "AA baixo", email: "a1@x", classe: "AA", nota: 80 }),
      p({ nome: "AA alto", email: "a2@x", classe: "AA", nota: 95 }),
      p({ nome: "Sem nota", email: "x@x", classe: "X", nota: null }),
    ];
    expect(ordenarParticipantes(lista).map((i) => i.nome)).toEqual(["AA alto", "AA baixo", "C1", "Sem nota"]);
  });
});

describe("detalhesDe", () => {
  it("mostra só os extras preenchidos, na ordem definida", () => {
    const d = detalhesDe(p({ cro: "MG 23926", acompanhante: "Sim, vou levar", comentario: "" }));
    expect(d.map((x) => x.label)).toEqual(["CRO", "Vai levar acompanhante"]);
    expect(d[0].valor).toBe("MG 23926");
  });

  it("junta lista em texto e traduz booleano", () => {
    const d = detalhesDe(p({ cro: null, categoria: ["Aluno", "VIP"], acompanhante: true }));
    expect(d.find((x) => x.label === "Categoria")?.valor).toBe("Aluno, VIP");
    expect(d.find((x) => x.label === "Vai levar acompanhante")?.valor).toBe("Sim");
  });
});
