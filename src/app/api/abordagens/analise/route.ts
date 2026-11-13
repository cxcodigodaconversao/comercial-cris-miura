import { NextRequest, NextResponse } from "next/server";
import { ErroApi, autenticar, responderErro } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { SELECT_ABORDAGEM, SELECT_INSCRITO } from "@/lib/consultas";
import type { Inscrito } from "@/lib/analise";
import { SISTEMA_ANALISE, conversasPorLead, interpretarAnalise, montarPrompt } from "@/lib/analise-abordagens";
import { ErroIA, gerarTexto } from "@/lib/gemini";
import type { Abordagem } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Quanto a rota inteira pode levar. A função do Netlify é cortada em 10 s
 * sem devolver o motivo (a tela só via "Erro 502"); parando antes, o erro
 * sai daqui, escrito.
 */
const PRAZO_MS = 9000;

/** Mais rápido primeiro: a leitura de 30 comentários não precisa do modelo grande. */
const MODELOS_RAPIDOS = ["gemini-flash-lite-latest", "gemini-2.5-flash-lite"];

const PAGINA = 1000;

/** O PostgREST corta em 1000 linhas por chamada; evento grande passa disso. */
async function lerTudo<T>(tabela: "abordagens" | "inscritos", colunas: string, eventoId: string): Promise<T[]> {
  const admin = supabaseAdmin();
  const tudo: T[] = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await admin
      .from(tabela)
      .select(colunas)
      .eq("evento_id", eventoId)
      .order("email")
      .range(de, de + PAGINA - 1);
    if (error) throw new ErroApi(500, `Falha ao ler ${tabela}: ${error.message}`);
    tudo.push(...((data ?? []) as unknown as T[]));
    if (!data || data.length < PAGINA) return tudo;
  }
}

/**
 * Só as leads abordadas: ler os 800 inscritos (com `extras`) para usar 30
 * gastava o tempo que a IA precisa. Acima de 300 e-mails a URL do filtro
 * ficaria grande demais, e aí vale ler tudo.
 */
async function lerInscritos(eventoId: string, emails: string[]): Promise<Inscrito[]> {
  if (!emails.length) return [];
  if (emails.length > 300) return lerTudo<Inscrito>("inscritos", SELECT_INSCRITO, eventoId);
  const { data, error } = await supabaseAdmin()
    .from("inscritos")
    .select(SELECT_INSCRITO)
    .eq("evento_id", eventoId)
    .in("email", emails);
  if (error) throw new ErroApi(500, `Falha ao ler inscritos: ${error.message}`);
  return (data ?? []) as unknown as Inscrito[];
}

/**
 * POST /api/abordagens/analise — lê os comentários dos closers do evento e
 * devolve a leitura para o palco: dificuldades, objeções e provas sociais.
 * Corpo: { eventoId }.
 *
 * Os comentários são lidos AQUI, do banco, e não recebidos da tela: a
 * análise tem de ser do que está registrado, e a rota gasta cota de IA.
 */
export async function POST(req: NextRequest) {
  try {
    const inicio = Date.now();
    const chamador = await autenticar(req);
    if (!["admin", "gestor", "closer"].includes(chamador.papel)) {
      throw new ErroApi(403, "Seu perfil não pode gerar a análise das abordagens.");
    }

    const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const eventoId = String(corpo?.eventoId ?? "");
    if (!eventoId) throw new ErroApi(400, "Evento não informado.");

    const abordagens = await lerTudo<Abordagem>("abordagens", SELECT_ABORDAGEM, eventoId);
    const inscritos = await lerInscritos(eventoId, [...new Set(abordagens.map((a) => a.email))]);

    const { prompt, usadas, cortadas } = montarPrompt(conversasPorLead(abordagens, inscritos));
    if (!usadas.length) {
      throw new ErroApi(422, "Ainda não há comentário de abordagem com texto neste evento.");
    }

    let resposta: string;
    try {
      resposta = await gerarTexto(
        SISTEMA_ANALISE,
        prompt,
        {
          responseMimeType: "application/json",
          // Sem "pensamento": a resposta precisa caber no tempo da função.
          thinkingConfig: { thinkingBudget: 0 },
        },
        { modelos: MODELOS_RAPIDOS, prazoMs: Math.max(3000, PRAZO_MS - (Date.now() - inicio)) }
      );
    } catch (e) {
      if (e instanceof ErroIA) throw new ErroApi(e.status, e.message);
      throw e;
    }

    const analise = interpretarAnalise(resposta, usadas, cortadas);
    if (!analise) throw new ErroApi(502, "A IA respondeu fora do formato. Toque em gerar de novo.");
    return NextResponse.json({ analise });
  } catch (e) {
    return responderErro(e);
  }
}
