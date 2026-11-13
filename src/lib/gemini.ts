import "server-only";
import { GoogleGenerativeAI } from "@google/generative-ai";

// ─────────────────────────────────────────────────────────────────────────
// Chamada ao Gemini, num lugar só.
//
// Existe porque o modelo cravado no código quebrou em produção sem aviso:
// `gemini-2.5-flash` deixou de ser servido para chaves novas e as duas
// rotas de contrato passaram a devolver 502 — em silêncio, porque ninguém
// olha log de API durante um evento.
//
// Daí as três decisões aqui:
//   1. o modelo vem de variável de ambiente, para trocar sem deploy;
//   2. há uma fila de candidatos, para uma descontinuação não derrubar;
//   3. se TODOS falharem, o erro traz a lista de modelos que a chave
//      realmente alcança — o erro passa a dizer como se conserta.
// ─────────────────────────────────────────────────────────────────────────

/** Primeiro o que o ambiente mandar; depois os apelidos, que o Google mantém
 *  apontando para a versão corrente da família. */
const CANDIDATOS = [
  process.env.GEMINI_MODEL,
  "gemini-flash-latest",
  "gemini-2.0-flash",
  "gemini-2.5-flash",
  "gemini-pro-latest",
].filter(Boolean) as string[];

export class ErroIA extends Error {
  constructor(
    message: string,
    readonly status = 502
  ) {
    super(message);
  }
}

/** Nomes de modelo que a chave enxerga — usado para explicar a falha. */
async function modelosDisponiveis(chave: string): Promise<string[]> {
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(chave)}`
    );
    if (!r.ok) return [];
    const dados = (await r.json()) as {
      models?: { name?: string; supportedGenerationMethods?: string[] }[];
    };
    return (dados.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m) => (m.name ?? "").replace(/^models\//, ""))
      .filter(Boolean);
  } catch {
    return [];
  }
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Limite de taxa da API: dois promotores gerando no mesmo instante batem nisso. */
const ehLimiteDeTaxa = (msg: string) =>
  msg.includes("429") ||
  msg.toLowerCase().includes("rate limit") ||
  msg.toLowerCase().includes("quota") ||
  msg.toLowerCase().includes("resource_exhausted");

export type OpcoesDeGeracao = {
  /** Modelos a tentar ANTES da fila padrão (ex.: um mais rápido). */
  modelos?: string[];
  /**
   * Tempo total que a chamada pode levar. A hospedagem mata a função sem
   * devolver motivo quando ela passa do limite; com o prazo, quem desiste
   * é este código, e o erro chega escrito na tela.
   */
  prazoMs?: number;
};

/**
 * Gera texto tentando os candidatos em ordem. Só um 404 de modelo faz
 * passar para o próximo: erro de chave se repetiria igual em todos, e
 * insistir só gastaria tempo do promotor esperando na tela.
 *
 * Limite de taxa é a exceção: acontece quando duas pessoas geram no mesmo
 * segundo, e uma segunda tentativa costuma passar. Sem isso, o promotor vê
 * um erro que não é dele e que some sozinho — o pior tipo de erro.
 *
 * `config` é o generationConfig opcional (ex.: resposta em JSON, sem
 * "pensamento" para caber no tempo da função). Se o modelo recusar a
 * configuração, a mesma chamada é refeita sem ela: melhor uma resposta
 * mais lenta do que nenhuma.
 */
export async function gerarTexto(
  sistema: string,
  prompt: string,
  config?: Record<string, unknown>,
  opcoes: OpcoesDeGeracao = {}
): Promise<string> {
  const chave = process.env.GEMINI_API_KEY;
  if (!chave) {
    throw new ErroIA("GEMINI_API_KEY não configurada no servidor.", 500);
  }

  const genAI = new GoogleGenerativeAI(chave);
  let ultimoErro = "";
  const inicio = Date.now();
  const restante = () => (opcoes.prazoMs ? opcoes.prazoMs - (Date.now() - inicio) : Infinity);
  const estourou = (modelo: string) =>
    new ErroIA(
      `A IA (${modelo}) não respondeu em ${Math.round((opcoes.prazoMs ?? 0) / 1000)} segundos. ` +
        "Toque em gerar de novo; se repetir, avise o suporte.",
      504
    );
  const fila = [...new Set([...(opcoes.modelos ?? []), ...CANDIDATOS])];

  for (const modelo of fila) {
    let usarConfig = Boolean(config);
    let esperou = false;
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      if (restante() < 1000) throw estourou(modelo);
      try {
        const m = genAI.getGenerativeModel(
          {
            model: modelo,
            systemInstruction: sistema,
            ...(usarConfig ? { generationConfig: config as never } : {}),
          },
          opcoes.prazoMs ? { timeout: restante() } : undefined
        );
        const r = await m.generateContent(prompt);
        const texto = r.response.text().trim();
        if (texto) return texto;
        ultimoErro = `O modelo ${modelo} respondeu vazio.`;
        break;
      } catch (e) {
        const msg = (e as Error).message ?? "";
        ultimoErro = msg;
        if (restante() < 1000) throw estourou(modelo);

        if (ehLimiteDeTaxa(msg) && !esperou) {
          esperou = true;
          await espera(1500);
          continue;
        }

        const modeloIndisponivel = msg.includes("404") || msg.toLowerCase().includes("not found");
        if (!modeloIndisponivel && usarConfig && !ehLimiteDeTaxa(msg)) {
          usarConfig = false;
          continue;
        }
        if (!modeloIndisponivel) {
          // Nem 404 nem limite de taxa: trocar de modelo não resolveria.
          return await falhar(chave, ultimoErro);
        }
        break;
      }
    }
  }

  return await falhar(chave, ultimoErro);
}

/**
 * Transforma a falha numa mensagem acionável.
 *
 * O 502 cru do Google não diz o que fazer. Listar os modelos que a chave
 * realmente alcança transforma o erro em instrução — foi assim que a
 * descontinuação do gemini-2.5-flash apareceu.
 */
async function falhar(chave: string, ultimoErro: string): Promise<never> {
  if (ehLimiteDeTaxa(ultimoErro)) {
    throw new ErroIA(
      "O limite de uso da IA foi atingido neste momento. Espere alguns segundos e gere de novo.",
      429
    );
  }

  const lista = await modelosDisponiveis(chave);
  throw new ErroIA(
    lista.length
      ? `Nenhum modelo configurado respondeu. Esta chave alcança: ${lista.slice(0, 8).join(", ")}. ` +
        `Defina GEMINI_MODEL com um deles nas variáveis de ambiente. (${ultimoErro.slice(0, 120)})`
      : `Falha ao chamar o Gemini: ${ultimoErro.slice(0, 200)}`
  );
}
