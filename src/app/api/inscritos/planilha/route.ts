import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { ErroApi, autenticar, responderErro } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  aplicarClint,
  aplicarCredenciamento,
  detectarPlanilha,
  usaRubricaCompleta,
  type LinhaBase,
  type LinhaPlanilha,
} from "@/lib/planilha-inscritos";

export const runtime = "nodejs";
export const maxDuration = 60;

const TAMANHO_MAXIMO = 20 * 1024 * 1024;
const COLUNAS =
  "email, nome, whatsapp, classe, nota, perfil, comprometimento, tipo, ja_aluno, faturamento, idade, " +
  "tempo_formado, area_atuacao, categoria_ticket, tem_produto, produtos, checkin_feito, d1, d2, d3, ligou, " +
  "resultado_ligacao, contato_confirmou, extras";

/**
 * POST /api/inscritos/planilha — atualiza a base de inscritos do evento a
 * partir de uma planilha .xlsx (credenciamento ou confirmados do Clint),
 * sem precisar gerar o HTML do painel.
 *
 * Ao contrário de /api/inscritos/importar, NÃO substitui a base: mescla por
 * e-mail (lib/planilha-inscritos.ts). Presença já marcada e closer
 * cadastrado à mão continuam valendo.
 */
export async function POST(req: NextRequest) {
  try {
    const chamador = await autenticar(req);
    if (chamador.papel !== "admin" && chamador.papel !== "gestor") {
      throw new ErroApi(403, "Só admin ou gestor atualiza a base de inscritos.");
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

    // ── Ler a planilha (1ª aba) ──────────────────────────────────────
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
    const tipo = detectarPlanilha(cabecalhos.filter(Boolean));
    if (!tipo) {
      throw new ErroApi(
        422,
        "Não reconheci esta planilha. Aceito o export de participantes do credenciamento (colunas Email e Check-in feito?) ou a planilha de confirmados do Clint (colunas E-mail e Quem confirmou)."
      );
    }

    const linhas: LinhaPlanilha[] = [];
    aba.eachRow((linha, numero) => {
      if (numero === 1) return;
      const obj: LinhaPlanilha = {};
      let temValor = false;
      cabecalhos.forEach((cab, i) => {
        if (!cab) return;
        const v = linha.getCell(i + 1).value;
        // E-mail pode vir como hyperlink e texto formatado como richText.
        let valor: unknown = v;
        if (v && typeof v === "object" && !(v instanceof Date)) {
          const o = v as { text?: unknown; result?: unknown; richText?: { text: string }[] };
          valor = o.richText ? o.richText.map((t) => t.text).join("") : (o.text ?? o.result ?? null);
        }
        if (valor !== null && valor !== undefined && valor !== "") temValor = true;
        obj[cab] = valor;
      });
      if (temValor) linhas.push(obj);
    });
    if (!linhas.length) throw new ErroApi(400, "A planilha está vazia.");

    // ── Base atual ───────────────────────────────────────────────────
    const base: LinhaBase[] = [];
    for (let de = 0; ; de += 1000) {
      const { data: lote, error } = await admin
        .from("inscritos")
        .select(COLUNAS)
        .eq("evento_id", eventoId)
        .order("email")
        .range(de, de + 999);
      if (error) throw new ErroApi(500, "Falha ao ler a base atual: " + error.message);
      base.push(...((lote ?? []) as unknown as LinhaBase[]));
      if (!lote || lote.length < 1000) break;
    }
    for (const r of base) r.extras = r.extras ?? {};

    if (tipo === "clint" && usaRubricaCompleta(base)) {
      throw new ErroApi(
        409,
        "A base deste evento veio de um painel com a pontuação completa (idade, prevenção, respostas abertas). A planilha do Clint não tem esses dados e rebaixaria as notas. Atualize este evento pelo HTML do painel."
      );
    }

    let removidos: string[] = [];
    let resultado: ReturnType<typeof aplicarClint>;
    if (tipo === "clint") resultado = aplicarClint(base, linhas);
    else {
      const r = aplicarCredenciamento(base, linhas);
      resultado = r;
      removidos = r.removidos;
    }

    // ── Gravar ───────────────────────────────────────────────────────
    const agora = new Date().toISOString();
    const gravar = resultado.linhas.map((r) => ({ ...r, evento_id: eventoId, importado_em: agora }));
    for (let i = 0; i < gravar.length; i += 200) {
      const { error } = await admin
        .from("inscritos")
        .upsert(gravar.slice(i, i + 200), { onConflict: "evento_id,email" });
      if (error) throw new ErroApi(500, "Falha ao gravar inscritos: " + error.message);
    }
    if (removidos.length) {
      const del = await admin.from("inscritos").delete().eq("evento_id", eventoId).in("email", removidos);
      if (del.error) throw new ErroApi(500, "Falha ao juntar cadastros repetidos: " + del.error.message);
    }

    return NextResponse.json({ resumo: resultado.resumo });
  } catch (e) {
    return responderErro(e);
  }
}
