import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { ErroApi, autenticar, responderErro } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  erroDeEstrutura,
  interpretarPlanilha,
  type LinhaPlanilha,
} from "@/lib/importacao-leads";

export const runtime = "nodejs";
// Planilha de 900 linhas leva mais que o padrão de 10s da plataforma.
export const maxDuration = 60;

const TAMANHO_MAXIMO = 10 * 1024 * 1024; // 10 MB

/**
 * POST /api/leads/importar — sobe a planilha de participantes de um evento.
 *
 * A leitura do arquivo acontece AQUI, não no navegador: o app é usado no
 * celular, e mandar um parser de xlsx para dentro do bundle penalizaria
 * todo mundo por causa de uma tela que só admin abre, de vez em quando.
 */
export async function POST(req: NextRequest) {
  try {
    const chamador = await autenticar(req);
    if (chamador.papel !== "admin" && chamador.papel !== "gestor") {
      throw new ErroApi(403, "Só admin ou gestor importa participantes.");
    }

    const form = await req.formData();
    const arquivo = form.get("arquivo");
    const eventoId = String(form.get("eventoId") ?? "");
    const confirmar = String(form.get("confirmar") ?? "") === "sim";

    if (!(arquivo instanceof File)) throw new ErroApi(400, "Nenhum arquivo enviado.");
    if (!eventoId) throw new ErroApi(400, "Evento não informado.");
    if (arquivo.size > TAMANHO_MAXIMO) {
      throw new ErroApi(413, "Arquivo acima de 10 MB. Exporte só a aba de participantes.");
    }

    const admin = supabaseAdmin();
    const { data: evento } = await admin
      .from("eventos")
      .select("id, nome")
      .eq("id", eventoId)
      .maybeSingle();
    if (!evento) throw new ErroApi(404, "Evento não encontrado.");

    // ── Ler a planilha ───────────────────────────────────────────────
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(await arquivo.arrayBuffer());
    } catch {
      throw new ErroApi(400, "Não consegui abrir o arquivo. Ele é mesmo um .xlsx?");
    }

    const aba = wb.worksheets[0];
    if (!aba) throw new ErroApi(400, "A planilha não tem nenhuma aba.");

    const cabecalhos: string[] = [];
    aba.getRow(1).eachCell((celula, col) => {
      cabecalhos[col - 1] = String(celula.value ?? "").trim();
    });

    const linhas: LinhaPlanilha[] = [];
    aba.eachRow((linha, numero) => {
      if (numero === 1) return;
      const obj: LinhaPlanilha = {};
      cabecalhos.forEach((cab, i) => {
        if (!cab) return;
        const v = linha.getCell(i + 1).value;
        // Célula de e-mail vem como objeto de hyperlink; interessa o texto.
        obj[cab] =
          v && typeof v === "object" && "text" in v
            ? (v as { text: unknown }).text
            : (v as unknown);
      });
      linhas.push(obj);
    });

    const relatorio = interpretarPlanilha(linhas);
    const erro = erroDeEstrutura(relatorio);
    if (erro) throw new ErroApi(422, erro);

    // ── Prévia: mostra o que vai acontecer antes de gravar ───────────
    const codigos = relatorio.leads.map((l) => l.codigoCracha);
    const { data: existentes } = await admin
      .from("leads")
      .select("codigo_cracha")
      .eq("evento_id", eventoId)
      .in("codigo_cracha", codigos);

    const jaExistem = new Set((existentes ?? []).map((l) => l.codigo_cracha as string));
    const novos = relatorio.leads.filter((l) => !jaExistem.has(l.codigoCracha)).length;

    const resumo = {
      evento: evento.nome,
      linhasNaPlanilha: relatorio.total,
      importaveis: relatorio.leads.length,
      novos,
      atualizados: relatorio.leads.length - novos,
      ignoradas: relatorio.ignoradas.length,
      // Amostra: a lista inteira de ignoradas pode ter centenas de linhas.
      exemplosIgnorados: relatorio.ignoradas.slice(0, 8),
      colunasDesconhecidas: relatorio.colunasDesconhecidas,
    };

    if (!confirmar) return NextResponse.json({ previa: true, resumo });

    // ── Gravar ───────────────────────────────────────────────────────
    // Upsert por (evento, crachá): reenviar a planilha atualiza quem já
    // está lá em vez de duplicar, e é assim que o time reimporta durante o
    // evento conforme os ingressos vão sendo emitidos.
    let gravados = 0;
    for (let i = 0; i < relatorio.leads.length; i += 500) {
      const lote = relatorio.leads.slice(i, i + 500).map((l) => ({
        evento_id: eventoId,
        codigo_cracha: l.codigoCracha,
        nome: l.nome,
        email: l.email,
        cpf: l.cpf,
        telefone: l.telefone,
        tipo: l.tipo,
        especialidade: l.especialidade,
      }));
      const { error } = await admin
        .from("leads")
        .upsert(lote, { onConflict: "evento_id,codigo_cracha" });
      if (error) throw new ErroApi(500, `Falha ao gravar: ${error.message}`);
      gravados += lote.length;
    }

    return NextResponse.json({ previa: false, resumo: { ...resumo, gravados } });
  } catch (e) {
    return responderErro(e);
  }
}
