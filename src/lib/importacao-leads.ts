import type { StatusLead } from "./types";

// ─────────────────────────────────────────────────────────────────────────
// Interpretação da planilha de participantes.
//
// Puro de propósito: recebe linhas já lidas (objetos cabeçalho→valor) e
// devolve o que dá para importar mais um relatório do que ficou de fora.
// Quem lê o arquivo é o chamador — a rota de API (exceljs) ou o script.
//
// O relatório é a parte importante. Uma importação que engole silenciosamente
// metade das linhas é pior que uma que recusa: o time descobre no meio do
// evento, com a fila parada na frente do crachá.
// ─────────────────────────────────────────────────────────────────────────

export type LinhaPlanilha = Record<string, unknown>;

export type LeadImportado = {
  codigoCracha: string;
  nome: string;
  email: string | null;
  cpf: string | null;
  telefone: string | null;
  tipo: string | null;
  especialidade: string | null;
  status: StatusLead;
};

export type LinhaIgnorada = { linha: number; nome: string; motivo: string };

export type RelatorioImportacao = {
  leads: LeadImportado[];
  ignoradas: LinhaIgnorada[];
  duplicadas: { codigoCracha: string; nomes: string[] }[];
  total: number;
  colunasEncontradas: Record<string, string | null>;
  colunasDesconhecidas: string[];
};

/**
 * Nomes aceitos para cada campo. A planilha vem de outro sistema e o
 * cabeçalho muda de exportação para exportação — exigir um nome exato faria
 * a importação falhar por causa de um acento.
 *
 * `codigoCracha` é o único obrigatório junto com `nome`: sem ele o QR não
 * tem o que ler, que é o motivo de tudo isso existir.
 */
const ALIASES: Record<keyof Omit<LeadImportado, "status">, string[]> = {
  codigoCracha: ["eticket", "e-ticket", "ticket", "codigo", "código", "cracha", "crachá", "qr", "id"],
  nome: ["nome", "participante", "nome completo"],
  email: ["email", "e-mail"],
  cpf: ["cpf", "documento"],
  telefone: ["telefone", "celular", "whatsapp", "fone"],
  tipo: ["classificacao", "classificação", "tipo", "categoria", "ingresso"],
  especialidade: ["especialidade", "area", "área", "qualificacao", "qualificação"],
};

const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/** Vazio inclui o travessão: é como a planilha de origem marca "sem valor". */
export function vazio(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  const s = String(v).trim();
  return s === "" || s === "—" || s === "-" || s === "--" || s.toLowerCase() === "n/a";
}

const texto = (v: unknown): string | null => (vazio(v) ? null : String(v).trim());

/** Descobre qual coluna da planilha corresponde a cada campo. */
export function mapearColunas(cabecalhos: string[]): {
  mapa: Record<string, string | null>;
  desconhecidas: string[];
} {
  const mapa: Record<string, string | null> = {};
  const usadas = new Set<string>();

  for (const [campo, aliases] of Object.entries(ALIASES)) {
    const achado = cabecalhos.find((c) => {
      const n = normalizar(c);
      return aliases.some((a) => n === normalizar(a));
    });
    mapa[campo] = achado ?? null;
    if (achado) usadas.add(achado);
  }

  return { mapa, desconhecidas: cabecalhos.filter((c) => !usadas.has(c)) };
}

/**
 * Converte as linhas da planilha em leads importáveis.
 *
 * Linha sem código de crachá NÃO é erro: é gente inscrita que ainda não
 * recebeu o ingresso. Entra no relatório como ignorada, com o motivo, e
 * volta a ser considerada quando a planilha for reenviada depois.
 */
export function interpretarPlanilha(linhas: LinhaPlanilha[]): RelatorioImportacao {
  const cabecalhos = linhas.length ? Object.keys(linhas[0]) : [];
  const { mapa, desconhecidas } = mapearColunas(cabecalhos);

  const leads: LeadImportado[] = [];
  const ignoradas: LinhaIgnorada[] = [];
  const porCodigo = new Map<string, string[]>();

  const ler = (linha: LinhaPlanilha, campo: string) => {
    const coluna = mapa[campo];
    return coluna ? linha[coluna] : null;
  };

  linhas.forEach((linha, i) => {
    // +2: a primeira linha da planilha é o cabeçalho, e o usuário conta a
    // partir de 1 — assim o número bate com o que ele vê no Excel.
    const numero = i + 2;
    const nome = texto(ler(linha, "nome"));
    const codigo = texto(ler(linha, "codigoCracha"));

    if (!codigo) {
      ignoradas.push({
        linha: numero,
        nome: nome ?? "(sem nome)",
        motivo: "sem código de crachá — não dá para ler por QR",
      });
      return;
    }
    if (!nome) {
      ignoradas.push({ linha: numero, nome: "(sem nome)", motivo: "sem nome" });
      return;
    }

    porCodigo.set(codigo, [...(porCodigo.get(codigo) ?? []), nome]);

    leads.push({
      codigoCracha: codigo,
      nome,
      email: texto(ler(linha, "email")),
      cpf: texto(ler(linha, "cpf")),
      telefone: texto(ler(linha, "telefone")),
      tipo: texto(ler(linha, "tipo")),
      especialidade: texto(ler(linha, "especialidade")),
      status: "novo",
    });
  });

  // O mesmo crachá em duas pessoas leva a venda para o lead errado na hora
  // do scan. Não dá para escolher por conta própria qual das duas vale.
  const duplicadas = [...porCodigo.entries()]
    .filter(([, nomes]) => nomes.length > 1)
    .map(([codigoCracha, nomes]) => ({ codigoCracha, nomes }));

  return {
    leads,
    ignoradas,
    duplicadas,
    total: linhas.length,
    colunasEncontradas: mapa,
    colunasDesconhecidas: desconhecidas,
  };
}

/** Mensagem curta de por que a planilha inteira não serve. */
export function erroDeEstrutura(rel: RelatorioImportacao): string | null {
  if (!rel.total) return "A planilha está vazia.";
  if (!rel.colunasEncontradas.codigoCracha) {
    return (
      "Não encontrei a coluna do código do crachá. Ela precisa se chamar " +
      "eTicket, Ticket, Código ou Crachá."
    );
  }
  if (!rel.colunasEncontradas.nome) {
    return "Não encontrei a coluna de nome.";
  }
  if (!rel.leads.length) {
    return "Nenhuma linha tem código de crachá — não há o que ler por QR.";
  }
  if (rel.duplicadas.length) {
    const exemplo = rel.duplicadas[0];
    return (
      `Há ${rel.duplicadas.length} código(s) de crachá repetido(s) entre pessoas ` +
      `diferentes (ex.: ${exemplo.codigoCracha} em ${exemplo.nomes.join(" e ")}). ` +
      "Corrija na origem — importar assim mandaria a venda para o lead errado."
    );
  }
  return null;
}
