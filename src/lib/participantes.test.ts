import { describe, expect, it } from "vitest";
import { normalizarLinha } from "./analise";
import type { Abordagem } from "./types";
import {
  abordagensPorEmail,
  contarPorClasse,
  filtrarClasse,
  detalhesDe,
  ehAluno,
  estaPresente,
  filtrarAluno,
  filtrarParticipantes,
  filtrarPresenca,
  resumoPresenca,
  rotulosPresenca,
  linkInstagram,
  linkWhatsapp,
  ordenarParticipantes,
  placarDeAbordagens,
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

describe("presença e aluno", () => {
  const lista = [
    p({ email: "a@x", checkin_feito: true, d1: true, d2: true, ja_aluno: "Sim" }),
    p({ email: "b@x", checkin_feito: true, d1: false, d2: false, d3: true, ja_aluno: "Não" }),
    p({ email: "c@x", checkin_feito: false, d1: false, d2: false, d3: false, ja_aluno: null }),
    p({ email: "d@x", checkin_feito: true, d1: false, d2: false, d3: false, ja_aluno: null }),
  ];

  it("um selo por dia presente, na ordem dos dias", () => {
    expect(rotulosPresenca(lista[0])).toEqual(["Presente 1º dia", "Presente 2º dia"]);
    expect(rotulosPresenca(lista[1])).toEqual(["Presente 3º dia"]);
    expect(rotulosPresenca(lista[2])).toEqual([]);
  });

  it("check-in sem dia marcado ainda conta como presente", () => {
    expect(rotulosPresenca(lista[3])).toEqual(["Presente"]);
    expect(estaPresente(lista[3])).toBe(true);
    expect(estaPresente(lista[2])).toBe(false);
  });

  it("filtra presentes e alunos, combináveis", () => {
    expect(filtrarPresenca(lista, "presentes").map((i) => i.email)).toEqual(["a@x", "b@x", "d@x"]);
    expect(filtrarPresenca(lista, "todos")).toHaveLength(4);
    expect(filtrarAluno(lista, "alunos").map((i) => i.email)).toEqual(["a@x"]);
    // quem não respondeu (c, d) não é aluno nem não aluno
    expect(filtrarAluno(lista, "nao_alunos").map((i) => i.email)).toEqual(["b@x"]);
    expect(filtrarAluno(filtrarPresenca(lista, "presentes"), "nao_alunos").map((i) => i.email)).toEqual(["b@x"]);
    expect(ehAluno(lista[0])).toBe(true);
  });

  it("resume presentes por dia abrindo aluno / não aluno", () => {
    const r = resumoPresenca(lista);
    expect(r.presentes).toBe(3);
    expect(r.alunos).toBe(1);
    expect(r.naoAlunos).toBe(1);
    expect(r.semResposta).toBe(1);
    expect(r.porDia).toEqual([
      { dia: 1, n: 1, alunos: 1, naoAlunos: 0, semResposta: 0 },
      { dia: 2, n: 1, alunos: 1, naoAlunos: 0, semResposta: 0 },
      { dia: 3, n: 1, alunos: 0, naoAlunos: 1, semResposta: 0 },
    ]);
  });
});

describe("filtrarClasse", () => {
  const lista = [p({ email: "a@x", classe: "AA" }), p({ email: "b@x", classe: "B" }), p({ email: "x@x", classe: "X", nota: null })];
  it("vazio = todas; com seleção, só as marcadas", () => {
    expect(filtrarClasse(lista, new Set())).toHaveLength(3);
    expect(filtrarClasse(lista, new Set(["AA", "B"] as const)).map((i) => i.email)).toEqual(["a@x", "b@x"]);
  });
  it("conta por classe, com zero nas ausentes", () => {
    const c = contarPorClasse(lista);
    expect(c.AA).toBe(1);
    expect(c.B).toBe(1);
    expect(c.X).toBe(1);
    expect(c.F).toBe(0);
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

const ab = (porNome: string, email: string, em = "2026-09-04T10:00:00Z"): Abordagem => ({
  id: Math.random().toString(36).slice(2),
  email,
  usuarioId: "u1",
  porNome,
  observacao: "conversamos",
  em,
});

describe("placarDeAbordagens", () => {
  it("conta PESSOAS distintas, não registros", () => {
    const p = placarDeAbordagens([
      ab("Bruna", "a@x"),
      ab("Bruna", "a@x"), // mesma lead de novo
      ab("Bruna", "b@x"),
      ab("Mila", "c@x"),
    ]);
    expect(p[0]).toEqual({ nome: "Bruna", pessoas: 2, registros: 3 });
    expect(p[1]).toEqual({ nome: "Mila", pessoas: 1, registros: 1 });
  });

  it("ordena por pessoas e desempata por nome", () => {
    const p = placarDeAbordagens([ab("Zoe", "a@x"), ab("Ana", "b@x")]);
    expect(p.map((x) => x.nome)).toEqual(["Ana", "Zoe"]);
  });

  it("lista vazia devolve placar vazio", () => {
    expect(placarDeAbordagens([])).toEqual([]);
  });
});

describe("abordagensPorEmail", () => {
  it("agrupa por lead com a mais recente primeiro", () => {
    const m = abordagensPorEmail([
      ab("Bruna", "a@x", "2026-09-01T10:00:00Z"),
      ab("Mila", "a@x", "2026-09-04T10:00:00Z"),
      ab("Mila", "b@x"),
    ]);
    expect(m.get("a@x")!.map((a) => a.porNome)).toEqual(["Mila", "Bruna"]);
    expect(m.get("b@x")).toHaveLength(1);
  });
});
