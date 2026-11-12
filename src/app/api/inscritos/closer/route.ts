import { NextRequest, NextResponse } from "next/server";
import { ErroApi, autenticar, responderErro } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizarEmail } from "@/lib/analise";
import { closerDoPainel } from "@/lib/participantes";

export const runtime = "nodejs";

/**
 * POST /api/inscritos/closer — cadastra (ou tira) o closer de uma lead que
 * o painel trouxe sem closer. Corpo: { eventoId, email, closer }.
 *
 * Grava em `extras.closer_manual`. Passa pela service role porque
 * `inscritos` não tem policy de escrita; quem pode é decidido aqui:
 * admin, gestor e closer. Lead que já tem closer no painel não muda —
 * a planilha do Clint é a fonte nesses casos.
 */
export async function POST(req: NextRequest) {
  try {
    const chamador = await autenticar(req);
    if (!["admin", "gestor", "closer"].includes(chamador.papel)) {
      throw new ErroApi(403, "Seu perfil não pode definir o closer de uma lead.");
    }

    const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const eventoId = String(corpo?.eventoId ?? "");
    const email = normalizarEmail(String(corpo?.email ?? ""));
    const closer = String(corpo?.closer ?? "").trim();
    if (!eventoId || !email) throw new ErroApi(400, "Evento ou lead não informado.");
    if (closer.length > 60) throw new ErroApi(400, "Nome do closer muito longo.");

    const admin = supabaseAdmin();
    const { data: linha, error } = await admin
      .from("inscritos")
      .select("extras")
      .eq("evento_id", eventoId)
      .eq("email", email)
      .maybeSingle();
    if (error) throw new ErroApi(500, "Falha ao ler a lead: " + error.message);
    if (!linha) throw new ErroApi(404, "Lead não encontrada neste evento.");

    const extras = { ...((linha.extras as Record<string, unknown> | null) ?? {}) };
    if (closerDoPainel({ extras })) {
      throw new ErroApi(409, "Esta lead já tem closer definido na planilha.");
    }
    if (closer) {
      extras.closer_manual = closer;
      extras.closer_manual_por = chamador.nome;
      extras.closer_manual_em = new Date().toISOString();
    } else {
      delete extras.closer_manual;
      delete extras.closer_manual_por;
      delete extras.closer_manual_em;
    }

    const up = await admin.from("inscritos").update({ extras }).eq("evento_id", eventoId).eq("email", email);
    if (up.error) throw new ErroApi(500, "Falha ao salvar o closer: " + up.error.message);

    return NextResponse.json({ extras });
  } catch (e) {
    return responderErro(e);
  }
}
