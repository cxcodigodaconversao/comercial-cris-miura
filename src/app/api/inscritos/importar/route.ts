import { NextRequest, NextResponse } from "next/server";
import { ErroApi, autenticar, responderErro } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { extrairInscritosDoPainel, type Inscrito } from "@/lib/analise";

export const runtime = "nodejs";
export const maxDuration = 60;

const TAMANHO_MAXIMO = 20 * 1024 * 1024; // o index.html do painel passa de 800 KB

/**
 * POST /api/inscritos/importar — sobe o index.html do painel de conversão
 * (ou um .json com a lista) e grava os inscritos do evento.
 *
 * Substitui a base inteira do evento a cada importação: o painel é a fonte
 * da verdade, e importações parciais deixariam inscritos fantasmas.
 * A gravação usa a service role porque `inscritos` não tem policy de
 * escrita — de propósito, ver a migração 0011.
 */
export async function POST(req: NextRequest) {
  try {
    const chamador = await autenticar(req);
    if (chamador.papel !== "admin" && chamador.papel !== "gestor") {
      throw new ErroApi(403, "Só admin ou gestor importa inscritos.");
    }

    const form = await req.formData();
    const arquivo = form.get("arquivo");
    const eventoId = String(form.get("eventoId") ?? "");
    if (!(arquivo instanceof File)) throw new ErroApi(400, "Nenhum arquivo enviado.");
    if (!eventoId) throw new ErroApi(400, "Evento não informado.");
    if (arquivo.size > TAMANHO_MAXIMO) throw new ErroApi(413, "Arquivo acima de 20 MB.");

    const admin = supabaseAdmin();
    const { data: evento } = await admin.from("eventos").select("id").eq("id", eventoId).maybeSingle();
    if (!evento) throw new ErroApi(404, "Evento não encontrado.");

    let inscritos: Inscrito[];
    let descartados: number;
    try {
      ({ inscritos, descartados } = extrairInscritosDoPainel(await arquivo.text()));
    } catch (e) {
      throw new ErroApi(400, (e as Error).message);
    }
    if (!inscritos.length) throw new ErroApi(400, "Nenhum inscrito com e-mail no arquivo.");

    const linhas = inscritos.map((i) => ({
      evento_id: eventoId,
      email: i.email,
      nome: i.nome,
      whatsapp: i.whatsapp,
      classe: i.classe,
      nota: i.nota,
      perfil: i.perfil,
      comprometimento: i.comprometimento,
      tipo: i.tipo,
      ja_aluno: i.jaAluno,
      faturamento: i.faturamento,
      idade: i.idade,
      tempo_formado: i.tempoFormado,
      area_atuacao: i.areaAtuacao,
      categoria_ticket: i.categoriaTicket,
      tem_produto: i.temProduto,
      produtos: i.produtos,
      checkin_feito: i.checkinFeito,
      d1: i.d1,
      d2: i.d2,
      d3: i.d3,
      ligou: i.ligou,
      resultado_ligacao: i.resultadoLigacao,
      contato_confirmou: i.contatoConfirmou,
      extras: i.extras,
      importado_em: new Date().toISOString(),
    }));

    const del = await admin.from("inscritos").delete().eq("evento_id", eventoId);
    if (del.error) throw new ErroApi(500, "Falha ao limpar a base anterior: " + del.error.message);

    // Em lotes: o PostgREST tem limite de tamanho por requisição.
    for (let i = 0; i < linhas.length; i += 200) {
      const { error } = await admin.from("inscritos").insert(linhas.slice(i, i + 200));
      if (error) throw new ErroApi(500, "Falha ao gravar inscritos: " + error.message);
    }

    return NextResponse.json({ importados: linhas.length, descartados });
  } catch (e) {
    return responderErro(e);
  }
}
