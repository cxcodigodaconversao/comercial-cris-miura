import { NextRequest, NextResponse } from "next/server";
import { ErroApi, autenticar, responderErro } from "@/lib/api-auth";
import { SISTEMA_DO_PLANO } from "@/lib/contrato-prompt";
import { ErroIA, gerarTexto } from "@/lib/gemini";
import { descreverParaIA, podeGerar, validar, type Plano } from "@/lib/parcelamento";

export const runtime = "nodejs";

/** POST /api/contrato-plano — gera o texto a partir do plano estruturado. */
export async function POST(req: NextRequest) {
  try {
    // Exige sessão: a rota consome cota paga de IA.
    await autenticar(req);

    let plano: Plano;
    try {
      plano = (await req.json()) as Plano;
    } catch {
      throw new ErroApi(400, "Corpo inválido.");
    }

    // Revalida no servidor: a checagem da tela é conveniência, não garantia —
    // sem isto, uma chamada direta gastaria cota para gerar um texto que
    // descreve um plano que não fecha.
    if (!podeGerar(plano)) {
      const bloqueio = validar(plano).find((p) => p.bloqueia);
      throw new ErroApi(422, bloqueio?.mensagem ?? "O plano não está completo.");
    }

    try {
      const texto = await gerarTexto(
        SISTEMA_DO_PLANO,
        `Gere o texto formal do plano de pagamento a partir destes dados:\n\n${descreverParaIA(plano)}`
      );
      return NextResponse.json({ texto });
    } catch (e) {
      if (e instanceof ErroIA) throw new ErroApi(e.status, e.message);
      throw e;
    }
  } catch (e) {
    return responderErro(e);
  }
}
