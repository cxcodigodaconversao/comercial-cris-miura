import { describe, expect, it } from "vitest";
import {
  aplicarClint,
  aplicarCredenciamento,
  detectarPlanilha,
  diasDaPlanilha,
  instagramValido,
  linhaVazia,
  usaRubricaCompleta,
} from "./planilha-inscritos";

const cred = (over: Record<string, unknown> = {}) => ({
  "Nome completo": "Ana Souza",
  Email: "Ana@X.com",
  Telefone: "(61) 98111-2222",
  Categoria: "ESSENCIAL",
  "Check-in feito?": "Não",
  "Data e hora do check-in": null,
  Nicho: "Clínico",
  "Criado em": "12/11/2026 07:35:21",
  "Atualizado em": "12/11/2026 07:35:21",
  ...over,
});
const clint = (over: Record<string, unknown> = {}) => ({
  Nome: "Ana Souza",
  "E-mail": "ana@x.com",
  Telefone: "5561981112222",
  CRO: "DF 1",
  Instagram: "@ana.souza",
  "Tempo de formado": "21 a 30 anos",
  "Especialização": "Periodontia",
  Faturamento: "Acima de R$ 40.000",
  "Status no formulário": "Concluído",
  Acompanhante: "Vou sozinho",
  "Quem confirmou": "Mila",
  ...over,
});

describe("detectarPlanilha", () => {
  it("reconhece pelas colunas", () => {
    expect(detectarPlanilha(["Nome completo", "Email", "Check-in feito?"])).toBe("credenciamento");
    expect(detectarPlanilha(["Nome", "E-mail", "Quem confirmou"])).toBe("clint");
    expect(detectarPlanilha(["Nome", "Telefone"])).toBeNull();
  });
});

describe("credenciamento", () => {
  it("cria quem falta, marca presença por dia e não desmarca a anterior", () => {
    const dia1 = aplicarCredenciamento([], [
      cred({ "Check-in feito?": "Sim", "Data e hora do check-in": "12/11/2026 08:10:00", "Atualizado em": "12/11/2026 08:10:00" }),
      cred({ Email: "b@x.com", "Nome completo": "Bia" }),
    ]);
    expect(dia1.resumo).toMatchObject({ novos: 2, presentes: 1, dias: ["12/11/2026"] });
    const ana = dia1.linhas.find((r) => r.email === "ana@x.com")!;
    expect(ana).toMatchObject({ d1: true, d2: false, checkin_feito: true, whatsapp: "5561981112222", ja_aluno: false });
    expect(ana.extras).toMatchObject({ hora_d1: "08:10", categoria: "Essencial", area: "Clínico", inscricao: "pre" });

    // Dia 2: o export guarda o 1º check-in e a última atualização.
    const dia2 = aplicarCredenciamento(dia1.linhas, [
      cred({ "Check-in feito?": "Sim", "Data e hora do check-in": "12/11/2026 08:10:00", "Atualizado em": "13/11/2026 09:00:00" }),
      cred({ Email: "b@x.com", "Nome completo": "Bia", "Check-in feito?": "Sim", "Data e hora do check-in": "13/11/2026 09:30:00", "Atualizado em": "13/11/2026 09:30:00" }),
      cred({ Email: "porta@x.com", "Nome completo": "Caio", "Criado em": "13/11/2026 09:40:00", "Check-in feito?": "Sim", "Data e hora do check-in": "13/11/2026 09:40:00" }),
    ]);
    const por = new Map(dia2.linhas.map((r) => [r.email, r]));
    expect(por.get("ana@x.com")).toMatchObject({ d1: true, d2: true });
    expect(por.get("b@x.com")).toMatchObject({ d1: false, d2: true });
    expect(por.get("porta@x.com")!.extras.inscricao).toBe("porta");
    expect(dia2.resumo).toMatchObject({ novos: 1, atualizados: 2, presentes: 3 });
  });
  it("dias: ignora data solta longe do evento e aceita Date do Excel", () => {
    expect(
      diasDaPlanilha([
        { "Check-in feito?": "Sim", "Data e hora do check-in": new Date(Date.UTC(2026, 10, 12, 8, 0, 0)) },
        { "Check-in feito?": "Sim", "Data e hora do check-in": "14/11/2026 08:00:00" },
        { "Check-in feito?": "Sim", "Data e hora do check-in": "20/11/2026 08:00:00" },
        { "Check-in feito?": "Não", "Data e hora do check-in": "13/11/2026 08:00:00" },
      ])
    ).toEqual(["12/11/2026", "14/11/2026"]);
  });
  it("não mexe na nota de base com rubrica completa", () => {
    const antiga = { ...linhaVazia("ana@x.com", "Ana"), classe: "AA" as const, nota: 89.5, faturamento: "Acima de R$ 40.000" };
    antiga.extras = { sentimento_prevencao: "Sinto que posso melhorar", form_status: "Concluído" };
    expect(usaRubricaCompleta([antiga])).toBe(true);
    const r = aplicarCredenciamento([antiga], [cred()]).linhas[0];
    expect(r).toMatchObject({ classe: "AA", nota: 89.5 });
  });
});

describe("clint", () => {
  it("traz closer e respostas, pontua e classifica", () => {
    const base = aplicarCredenciamento([], [cred({ Categoria: "ALUNO" }), cred({ Email: "b@x.com", "Nome completo": "Bia" })]).linhas;
    const r = aplicarClint(base, [clint()]);
    const ana = r.linhas.find((x) => x.email === "ana@x.com")!;
    // perfil (25+20+18+10)=73 → 88 · comp (40+8+10)=58 → 89 · nota 88×0,7+89×0,3
    expect(ana).toMatchObject({ perfil: 88, comprometimento: 89, nota: 88.3, classe: "AA", tipo: "completo", contato_confirmou: "Confirmou" });
    expect(ana.extras).toMatchObject({ closer: "Mila", instagram: "ana.souza", area: "Periodontia" });
    expect(r.linhas.find((x) => x.email === "b@x.com")).toMatchObject({ classe: "X", nota: null });
    expect(r.resumo).toMatchObject({ atualizados: 1, novos: 0, comNota: 1 });
  });
  it("casa por telefone quando o e-mail difere; quem não está na base entra", () => {
    const base = aplicarCredenciamento([], [cred()]).linhas;
    const r = aplicarClint(base, [clint({ "E-mail": "outro@x.com" }), clint({ "E-mail": "novo@x.com", Telefone: "5561977776666", Nome: "Novo" })]);
    expect(r.linhas.map((x) => x.email).sort()).toEqual(["ana@x.com", "novo@x.com"]);
    expect(r.linhas.find((x) => x.email === "ana@x.com")!.extras.form_match).toBe("telefone");
    expect(r.resumo).toMatchObject({ atualizados: 1, novos: 1 });
  });
  it("Clint antes do credenciamento dá o mesmo resultado e junta o e-mail diferente", () => {
    const a = aplicarClint([], [clint({ "E-mail": "outro@x.com" })]);
    const b = aplicarCredenciamento(a.linhas, [cred({ Categoria: "ALUNO" })]);
    expect(b.removidos).toEqual(["outro@x.com"]);
    expect(b.linhas).toHaveLength(1);
    expect(b.linhas[0]).toMatchObject({ email: "ana@x.com", nota: 88.3, classe: "AA" });
  });
  it("mantém o closer cadastrado à mão", () => {
    const base = aplicarCredenciamento([], [cred({ Email: "b@x.com" })]).linhas;
    base[0].extras.closer_manual = "Gabriel";
    expect(aplicarClint(base, [clint()]).linhas.find((x) => x.email === "b@x.com")!.extras.closer_manual).toBe("Gabriel");
  });
});

describe("instagramValido", () => {
  it("aceita @perfil e recusa e-mail, site e texto solto", () => {
    expect(instagramValido("@dra.ana_1")).toBe("dra.ana_1");
    expect(instagramValido("ana\\_souza")).toBe("ana_souza");
    expect(instagramValido("ana@gmail.com")).toBeNull();
    expect(instagramValido("atmnobre.com.br")).toBeNull();
    expect(instagramValido("Dra Ana")).toBeNull();
    expect(instagramValido("N")).toBeNull();
  });
});
