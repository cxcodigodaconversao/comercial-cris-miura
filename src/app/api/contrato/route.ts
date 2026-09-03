import { NextRequest, NextResponse } from "next/server";
import { autenticar, responderErro } from "@/lib/api-auth";
import { SISTEMA_DA_VENDA } from "@/lib/contrato-prompt";
import { ErroIA, gerarTexto } from "@/lib/gemini";
import type { Venda } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  // Exige sessão: a rota consome cota paga de IA. (No projeto de origem
  // esta rota estava aberta — corrigido aqui.)
  try {
    await autenticar(req);
  } catch (e) {
    return responderErro(e);
  }

  let v: Venda;
  try {
    v = (await req.json()) as Venda;
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const dados = [
    `Cliente: ${v.cliente || "-"}`,
    `Valor base da venda: R$ ${v.valor}`,
    `Valor já recebido (entrada): R$ ${v.recebido || 0}`,
    `Recebimento completo? ${v.completo ? "sim" : "não"}`,
    !v.completo ? `Valor restante: R$ ${v.restante || 0}` : "",
    v.negociacao ? `Como o restante foi negociado (texto livre do vendedor): ${v.negociacao}` : "",
    v.observacao ? `Observação do vendedor: ${v.observacao}` : "",
    `Faixa de recebimento: ${v.faixaLabel || "-"}`,
    `Data da venda: ${v.dataVenda || "-"}`,
  ].filter(Boolean).join("\n");

  try {
    const texto = await gerarTexto(
      SISTEMA_DA_VENDA,
      `Gere o texto formal do plano de pagamento a partir destes dados:\n\n${dados}`
    );
    return NextResponse.json({ texto });
  } catch (e) {
    const status = e instanceof ErroIA ? e.status : 502;
    return NextResponse.json(
      { error: (e as Error).message || "Falha ao chamar o Gemini." },
      { status }
    );
  }
}
