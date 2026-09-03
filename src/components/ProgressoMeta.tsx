"use client";

import { useMemo } from "react";
import { Target, TrendingUp } from "lucide-react";
import { fmtPts, fmtVal } from "@/lib/config";
import type { Evento, MetricaMeta, Venda } from "@/lib/types";
import { Card, CardContent } from "./ui/card";

const ROTULO: Record<MetricaMeta, string> = {
  faturamento: "faturamento",
  recebido: "recebido",
  vendas: "vendas",
  pontos: "pontos",
};

function medir(vendas: Venda[], metrica: MetricaMeta): number {
  switch (metrica) {
    case "faturamento":
      return vendas.reduce((a, v) => a + (v.valor || 0), 0);
    case "recebido":
      return vendas.reduce((a, v) => a + (v.recebido || 0), 0);
    case "vendas":
      return vendas.length;
    case "pontos":
      return vendas.reduce((a, v) => a + (v.pts || 0), 0);
  }
}

const formatar = (n: number, m: MetricaMeta) =>
  m === "vendas" ? String(n) : m === "pontos" ? fmtPts(n) : fmtVal(n);

/**
 * Progresso da meta do evento.
 *
 * A porcentagem sozinha não ajuda ninguém em campo: o time precisa do GAP
 * (quanto falta, em dinheiro) e do RITMO (se mantiver assim, fecha em quanto).
 * É isso que transforma a meta em decisão durante o evento, não em placar.
 */
export function ProgressoMeta({ evento, vendas }: { evento: Evento; vendas: Venda[] }) {
  const meta = evento.metas?.find((m) => m.escopo === "evento");

  const dados = useMemo(() => {
    if (!meta) return null;
    const atual = medir(vendas, meta.metrica);
    const pct = meta.valor > 0 ? Math.min(100, Math.round((atual / meta.valor) * 100)) : 0;
    const gap = Math.max(0, meta.valor - atual);

    // Projeção só faz sentido com o evento em andamento e com datas definidas.
    let projecao: number | null = null;
    if (evento.dataInicio && evento.dataFim) {
      const dia = 86_400_000;
      const inicio = new Date(evento.dataInicio + "T00:00:00").getTime();
      const fim = new Date(evento.dataFim + "T23:59:59").getTime();
      const agora = Date.now();
      if (agora > inicio && agora < fim) {
        const decorridos = Math.max(1, Math.ceil((agora - inicio) / dia));
        const totais = Math.max(1, Math.ceil((fim - inicio) / dia));
        projecao = (atual / decorridos) * totais;
      }
    }

    return { atual, pct, gap, projecao, batida: atual >= meta.valor };
  }, [meta, vendas, evento.dataInicio, evento.dataFim]);

  if (!meta || !dados) return null;

  return (
    <Card className="mb-3">
      <CardContent className="pt-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="eyebrow flex items-center gap-1.5">
            <Target className="h-3.5 w-3.5" /> Meta de {ROTULO[meta.metrica]}
          </span>
          <span className="num text-sm font-semibold">
            {dados.pct}%
          </span>
        </div>

        <div className="num flex items-baseline gap-1.5">
          <span className="text-2xl font-semibold text-accent">
            {formatar(dados.atual, meta.metrica)}
          </span>
          <span className="text-sm text-muted-foreground">
            de {formatar(meta.valor, meta.metrica)}
          </span>
        </div>

        <div className="mt-2.5 h-2 rounded-full bg-muted">
          <div
            className="h-2 rounded-full transition-all"
            style={{
              width: `${dados.pct}%`,
              background: dados.batida ? "var(--success)" : "var(--accent)",
            }}
          />
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          {dados.batida ? (
            <span className="font-medium text-success">Meta batida.</span>
          ) : (
            <span className="text-muted-foreground">
              Faltam{" "}
              <strong className="num font-medium text-foreground">
                {formatar(dados.gap, meta.metrica)}
              </strong>
            </span>
          )}

          {dados.projecao !== null && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5" />
              Neste ritmo, fecha em{" "}
              <strong className="num font-medium text-foreground">
                {formatar(Math.round(dados.projecao), meta.metrica)}
              </strong>
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
