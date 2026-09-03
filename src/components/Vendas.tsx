"use client";

import { useState } from "react";
import { Copy, Download, FileText, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase/cliente";
import { coordena, fmtData, fmtHora, fmtPts, fmtVal, leTodasAsVendas } from "@/lib/config";
import { exportarVendasExcel } from "@/lib/exportar-vendas";
import type { Evento, Usuario, Venda } from "@/lib/types";
import { EditModal } from "./EditModal";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, Empty } from "./ui/card";
import { useFeedback } from "./ui/feedback";

export function Vendas({
  vendas,
  perfil,
  evento,
}: {
  vendas: Venda[];
  perfil: Usuario;
  evento: Evento;
}) {
  const { toast, confirmar } = useFeedback();
  // Ler todas e poder editar são coisas diferentes: o promotor lê o evento
  // inteiro para gerar contrato, mas só edita a própria venda. Nas vendas
  // dos outros, o banco recusa qualquer campo que não seja o do contrato.
  const leTodas = leTodasAsVendas(perfil.papel);
  const podeCoordenar = coordena(perfil.papel);
  const isAdmin = perfil.papel === "admin";
  const [editando, setEditando] = useState<Venda | null>(null);
  const [gerando, setGerando] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);

  async function exportar() {
    if (!vendas.length) return toast("aviso", "Nenhuma venda para exportar.");
    setExportando(true);
    try {
      // Exporta o EVENTO inteiro (todas as vendas), não só as visíveis:
      // é a planilha de fechamento, e quem a gera é o admin.
      await exportarVendasExcel(vendas, evento.nome.replace(/[^\p{L}\p{N}]+/gu, "_"));
    } catch (e) {
      toast("erro", "Não foi possível exportar.", (e as Error).message);
    } finally {
      setExportando(false);
    }
  }

  async function excluir(v: Venda) {
    const ok = await confirmar({
      titulo: `Excluir a venda de ${v.cliente}?`,
      descricao: (
        <>
          Isso remove <strong>{fmtVal(v.valor)}</strong> e{" "}
          <strong>
            {fmtPts(v.pts)} ponto{v.pts !== 1 ? "s" : ""}
          </strong>{" "}
          de {v.closerNome} no ranking deste evento. A ação não pode ser desfeita.
        </>
      ),
      confirmar: "Excluir",
      perigo: true,
    });
    if (!ok) return;

    // O rastro é gravado ANTES do delete. A tabela de auditoria não tem
    // chave estrangeira para vendas justamente para sobreviver a isto.
    await supabase.from("venda_auditoria").insert({
      venda_id: v.id,
      evento_id: v.eventoId,
      acao: "excluiu",
      por_usuario: perfil.id,
      por_nome: perfil.nome,
      alteracoes: [
        { campo: "cliente", de: v.cliente, para: null },
        { campo: "valor", de: v.valor, para: null },
        { campo: "pts", de: v.pts, para: null },
      ],
    });

    const { error } = await supabase.from("vendas").delete().eq("id", v.id);
    if (error) return toast("erro", "Não foi possível excluir.", error.message);
    toast("sucesso", "Venda excluída.");
  }

  async function gerarContrato(v: Venda) {
    setGerando(v.id);
    try {
      const { data: sessao } = await supabase.auth.getSession();
      const res = await fetch("/api/contrato", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessao.session?.access_token}`,
        },
        body: JSON.stringify(v),
      });
      const dados = await res.json();
      if (!res.ok) throw new Error(dados.error || "Falha ao gerar");

      const { error } = await supabase
        .from("vendas")
        .update({ contrato: dados.texto, contrato_em: new Date().toISOString() })
        .eq("id", v.id);
      if (error) throw new Error(error.message);

      toast("sucesso", "Texto do contrato gerado.");
    } catch (e) {
      toast("erro", "Não foi possível gerar o contrato.", (e as Error).message);
    } finally {
      setGerando(null);
    }
  }

  async function copiar(texto: string) {
    await navigator.clipboard.writeText(texto);
    toast("sucesso", "Copiado.");
  }

  return (
    <>
      <Card>
        <CardContent className="pt-4">
          <p className="eyebrow mb-3">{leTodas ? "Histórico de vendas" : "Minhas vendas"}</p>

          {!vendas.length ? (
            <Empty>
              {leTodas ? "Nenhuma venda neste evento" : "Você ainda não registrou vendas"}
            </Empty>
          ) : (
            vendas.map((v) => {
              const minha = v.usuarioId === perfil.id;
              const podeEditar = podeCoordenar || minha;
              return (
                <div key={v.id} className="border-b border-border py-3.5 last:border-0">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-sm font-semibold">{v.closerNome}</span>
                      {minha && !leTodas && <Badge tone="accent">minha</Badge>}
                    </span>
                    <span className="num shrink-0 rounded-full tint px-2.5 py-0.5 text-xs font-semibold text-accent">
                      +{fmtPts(v.pts)}
                    </span>
                  </div>

                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <strong className="truncate text-sm">{v.cliente}</strong>
                    <span className="num shrink-0 text-xs text-muted-foreground">
                      {fmtHora(v.criadoEm)}
                    </span>
                  </div>

                  <div className="space-y-0.5 text-[13px] leading-relaxed text-muted-foreground">
                    {v.email && <div className="truncate">{v.email}</div>}
                    {(v.telefone || v.dataVenda) && (
                      <div className="num">
                        {v.telefone}
                        {v.telefone && v.dataVenda && " · "}
                        {fmtData(v.dataVenda)}
                      </div>
                    )}
                    <div className="num">
                      Venda: {fmtVal(v.valor)} · Recebido: {fmtVal(v.recebido)}
                    </div>
                    <div>
                      {v.faixaLabel}
                      {v.completo && <span className="text-success"> · completo</span>}
                      {v.cadeira && (
                        <span className="text-accent"> · 2ª cadeira ({fmtVal(v.valorCadeira)})</span>
                      )}
                    </div>
                  </div>

                  {v.negociacao && (
                    <p className="mt-1.5 rounded-md border border-border tint px-2 py-1 text-xs">
                      Restante {fmtVal(v.restante)}: {v.negociacao}
                    </p>
                  )}
                  {v.observacao && (
                    <p className="mt-1.5 rounded-md border border-border tint px-2 py-1 text-xs">
                      Obs: {v.observacao}
                    </p>
                  )}

                  {v.contrato && (
                    <div className="mt-2 rounded-lg border border-border bg-background p-3">
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="eyebrow">Texto p/ contrato</span>
                        <button
                          className="flex items-center gap-1 text-xs text-accent"
                          onClick={() => copiar(v.contrato!)}
                        >
                          <Copy className="h-3.5 w-3.5" /> copiar
                        </button>
                      </div>
                      <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{v.contrato}</p>
                    </div>
                  )}

                  {/* Gerar contrato é ação de quem VÊ a venda — é o trabalho
                      do promotor. Editar e excluir continuam separados. */}
                  <div className="mt-2.5 flex gap-2">
                    {podeEditar && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => setEditando(v)}
                      >
                        <Pencil className="h-3.5 w-3.5" /> Editar
                      </Button>
                    )}
                    <Button
                      variant={podeEditar ? "outline" : "accent"}
                      size="sm"
                      className={podeEditar ? undefined : "flex-1"}
                      disabled={gerando === v.id}
                      onClick={() => gerarContrato(v)}
                    >
                      <FileText className="h-3.5 w-3.5" />
                      {gerando === v.id ? "Gerando..." : v.contrato ? "Refazer contrato" : "Contrato"}
                    </Button>
                    {isAdmin && (
                      <Button
                        variant="danger-outline"
                        size="icon-sm"
                        aria-label="Excluir venda"
                        onClick={() => excluir(v)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* Planilha de fechamento: mesma estrutura do app anterior (Ranking,
          Todas as Vendas, Vendas Detalhadas e uma aba por closer). Só o
          admin exporta — a planilha carrega dados de todo o time. */}
      {isAdmin && vendas.length > 0 && (
        <Button
          variant="outline"
          size="lg"
          full
          className="mt-3"
          disabled={exportando}
          onClick={exportar}
        >
          <Download className="h-4 w-4" />
          {exportando ? "Gerando planilha..." : "Exportar planilha Excel"}
        </Button>
      )}

      {editando && (
        <EditModal
          venda={editando}
          evento={evento}
          perfil={perfil}
          onClose={() => setEditando(null)}
        />
      )}
    </>
  );
}
