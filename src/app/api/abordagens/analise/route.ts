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
 * POST /api/abordagens/analise — lê os comentários dos closers do evento e
 * devolve a leitura para o palco: dificuldades, objeções e provas sociais.
 * Corpo: { eventoId }.
 *
 * Os comentários são lidos AQUI, do banco, e não recebidos da tela: a
 * análise tem de ser do que está registrado, e a rota gasta cota de IA.
 */
export async function POST(req: NextRequest) {
  try {
    const chamador = await autenticar(req);
    if (!["admin", "gestor", "closer"].includes(chamador.papel)) {
      throw new ErroApi(403, "Seu perfil não pode gerar a análise das abordagens.");
    }

    const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const eventoId = String(corpo?.eventoId ?? "");
    if (!eventoId) throw new ErroApi(400, "Evento não informado.");

    const [abordagens, inscritos] = await Promise.all([
      lerTudo<Abordagem>("abordagens", SELECT_ABORDAGEM, eventoId),
      lerTudo<Inscrito>("inscritos", SELECT_INSCRITO, eventoId),
    ]);

    const { prompt, usadas, cortadas } = montarPrompt(conversasPorLead(abordagens, inscritos));
    if (!usadas.length) {
      throw new ErroApi(422, "Ainda não há comentário de abordagem com texto neste evento.");
    }

    let resposta: string;
    try {
      resposta = await gerarTexto(SISTEMA_ANALISE, prompt);
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
