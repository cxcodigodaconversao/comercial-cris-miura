import { describe, expect, it } from "vitest";
import { normalizarLinha } from "./analise";
import {
  closersQueAbordaram,
  conversasPorLead,
  filtrarConversas,
  interpretarAnalise,
  leadsComMaisDeUmCloser,
  montarPrompt,
} from "./analise-abordagens";
import type { Abordagem } from "./types";

const lead = (over: Record<string, unknown>) =>
  normalizarLinha({ nome: "Ana Souza", email: "ana@x.com", classe: "A", nota: 80, ...over })!;

let seq = 0;
const ab = (email: string, porNome: string, observacao: string, em: string): Abordagem => ({
  id: `a${++seq}`,
  email,
  usuarioId: null,
  porNome,
  observacao,
  em,
});

const inscritos = [
  lead({ checkin_feito: true, closer: "Bruna" }),
  lead({ nome: "Carla Dias", email: "carla@x.com", classe: "C" }),
];

const abordagens = [
  ab("ana@x.com", "Bruna", "Disse que não tem dinheiro agora, marido decide junto.", "2026-11-12T10:00:00Z"),
  ab("ana@x.com", "Diego", "Quer ver caso de quem saiu do plantão.", "2026-11-12T15:00:00Z"),
  ab("carla@x.com", "Bruna", "Agenda vazia, medo de cobrar caro.", "2026-11-12T12:00:00Z"),
  ab("fora@x.com", "Diego", "   ", "2026-11-12T09:00:00Z"),
];

describe("conversasPorLead", () => {
  const conversas = conversasPorLead(abordagens, inscritos);

  it("agrupa por lead, conversa mais recente primeiro", () => {
    expect(conversas.map((c) => c.email)).toEqual(["ana@x.com", "carla@x.com", "fora@x.com"]);
    expect(conversas[0].registros.map((r) => r.porNome)).toEqual(["Diego", "Bruna"]);
  });

  it("traz quem abordou, o closer responsável e a presença", () => {
    expect(conversas[0]).toMatchObject({
      nome: "Ana Souza",
      classe: "A",
      presente: true,
      closerResponsavel: "Bruna",
      abordadaPor: ["Diego", "Bruna"],
    });
    expect(conversas[1].closerResponsavel).toBeNull();
  });

  it("lead fora da base aparece pelo e-mail", () => {
    expect(conversas[2]).toMatchObject({ nome: "fora@x.com", classe: null, presente: false });
  });

  it("conta leads por quem abordou e filtra", () => {
    expect(closersQueAbordaram(conversas)).toEqual([
      { nome: "Bruna", leads: 2, comentarios: 2 },
      { nome: "Diego", leads: 2, comentarios: 2 },
    ]);
    expect(leadsComMaisDeUmCloser(conversas)).toBe(1);
    // Bruna falou com a Carla depois de falar com a Ana.
    expect(filtrarConversas(conversas, "Bruna", "").map((c) => c.email)).toEqual(["carla@x.com", "ana@x.com"]);
    expect(filtrarConversas(conversas, "", "PLANTAO").map((c) => c.email)).toEqual(["ana@x.com"]);
    expect(filtrarConversas(conversas, "Diego", "agenda")).toEqual([]);
  });

  it("com filtro de closer, a lead mostra só os comentários dele", () => {
    const [ana] = filtrarConversas(conversas, "Diego", "plantao");
    expect(ana.registros.map((r) => r.porNome)).toEqual(["Diego"]);
    expect(ana.abordadaPor).toEqual(["Diego", "Bruna"]);
    // O comentário da Bruna na mesma lead não entra na busca do Diego.
    expect(filtrarConversas(conversas, "Diego", "marido")).toEqual([]);
    const total = closersQueAbordaram(conversas).reduce((s, c) => s + c.comentarios, 0);
    expect(total).toBe(abordagens.length);
  });
});

describe("montarPrompt", () => {
  const conversas = conversasPorLead(abordagens, inscritos);

  it("numera as leads, põe quem anotou e deixa de fora quem não tem texto", () => {
    const { prompt, usadas, cortadas } = montarPrompt(conversas);
    expect(usadas.map((c) => c.email)).toEqual(["ana@x.com", "carla@x.com"]);
    expect(cortadas).toBe(0);
    expect(prompt).toContain("L1 | classe A | presente");
    expect(prompt).toContain("L2 | classe C | sem check-in");
    expect(prompt).toContain("- (Bruna) Disse que não tem dinheiro agora, marido decide junto.");
    expect(prompt).not.toContain("ana@x.com");
    expect(prompt).not.toContain("Ana Souza");
  });

  it("leva a direção da mentoria: produtos do evento e o texto da equipe", () => {
    const { prompt } = montarPrompt(conversas, undefined, {
      produtos: ["Mentoria Premium", " "],
      mentoria: "  Encontros quinzenais com a Dra. Cristina.  ",
    });
    expect(prompt).toContain("Produtos à venda neste evento: Mentoria Premium.");
    expect(prompt).toContain("Encontros quinzenais com a Dra. Cristina.");
    expect(prompt.indexOf("<mentoria>")).toBeLessThan(prompt.indexOf("<anotacoes>"));
    expect(montarPrompt(conversas).prompt).toContain("<mentoria>\n(não informado)\n</mentoria>");
  });

  it("respeita o teto ficando com as mais recentes", () => {
    const { usadas, cortadas } = montarPrompt(conversas, 60);
    expect(usadas.map((c) => c.email)).toEqual(["ana@x.com"]);
    expect(cortadas).toBe(1);
  });
});

describe("interpretarAnalise", () => {
  const { usadas } = montarPrompt(conversasPorLead(abordagens, inscritos));
  const resposta = (o: unknown) => "```json\n" + JSON.stringify(o) + "\n```";

  it("liga os números às leads e descarta o que não existe", () => {
    const a = interpretarAnalise(
      resposta({
        resumo: "Salão travado em dinheiro.",
        mensagemCentral: "Sozinha você continua com a agenda vazia.",
        dificuldades: [
          {
            titulo: "Agenda vazia",
            descricao: "x",
            sozinho: "Tenta há anos sem direção.",
            naMentoria: "Mostrar o acompanhamento.",
            leads: [2, 2, 9, "L1"],
            frases: [],
          },
        ],
        objecoes: [],
        provasSociais: [],
      }),
      usadas
    )!;
    expect(a.dificuldades[0].leads).toEqual([
      { email: "carla@x.com", nome: "Carla Dias" },
      { email: "ana@x.com", nome: "Ana Souza" },
    ]);
    expect(a.mensagemCentral).toBe("Sozinha você continua com a agenda vazia.");
    expect(a.dificuldades[0]).toMatchObject({
      sozinho: "Tenta há anos sem direção.",
      naMentoria: "Mostrar o acompanhamento.",
    });
    expect(a.leadsAnalisadas).toBe(2);
    expect(a.comentarios).toBe(3);
  });

  it("só mantém frase que está escrita num comentário", () => {
    const a = interpretarAnalise(
      resposta({
        resumo: "",
        objecoes: [
          {
            titulo: "Dinheiro",
            comoQuebrar: "Mostrar o parcelamento.",
            leads: [1],
            frases: ["não tem dinheiro agora", "MEDO DE COBRAR CARO.", "preciso pensar com calma", "medo"],
          },
        ],
      }),
      usadas
    )!;
    expect(a.objecoes[0].frases).toEqual(["não tem dinheiro agora", "MEDO DE COBRAR CARO."]);
    expect(a.objecoes[0].comoQuebrar).toBe("Mostrar o parcelamento.");
  });

  it("ordena pelo número de leads e ignora item sem título", () => {
    const a = interpretarAnalise(
      resposta({
        provasSociais: [
          { titulo: "", leads: [1, 2] },
          { titulo: "Caso B", perfilDoCaso: "p", responde: "r", leads: [1] },
          { titulo: "Caso A", leads: [1, 2] },
        ],
      }),
      usadas
    )!;
    expect(a.provasSociais.map((i) => i.titulo)).toEqual(["Caso A", "Caso B"]);
  });

  it("devolve null quando não há JSON ou veio vazio", () => {
    expect(interpretarAnalise("Desculpe, não consegui.", usadas)).toBeNull();
    expect(interpretarAnalise("{quebrado", usadas)).toBeNull();
    expect(interpretarAnalise("{}", usadas)).toBeNull();
  });
});
