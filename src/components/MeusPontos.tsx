"use client";

import { fmtData, fmtHora, fmtPts, fmtVal } from "@/lib/config";
import type { Usuario, Venda } from "@/lib/types";
import { Card, CardContent, Empty } from "./ui/card";

/**
 * Visão do próprio vendedor. As vendas chegam já filtradas pelo RLS —
 * ele não vê nem o volume dos colegas.
 */
export function MeusPontos({ vendas, perfil }: { vendas: Venda[]; perfil: Usuario }) {
  const pts = vendas.reduce((a, v) => a + (v.pts || 0), 0);
  const recebido = vendas.reduce((a, v) => a + (v.recebido || 0), 0);

  return (
    <>
      <Card className="mb-3">
        <CardContent className="pt-5 text-center">
          <p className="eyebrow">{perfil.nome} · minha pontuação</p>
          <div className="num mt-3 text-[60px] font-semibold leading-none text-accent">
            {fmtPts(pts)}
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">pontos acumulados</p>

          <div className="mt-5 flex gap-2.5">
            <div className="flex-1 rounded-lg border border-border bg-background px-2.5 py-3.5">
              <div className="num text-xl font-semibold">{vendas.length}</div>
              <div className="eyebrow mt-1">Vendas</div>
            </div>
            <div className="flex-1 rounded-lg border border-border bg-background px-2.5 py-3.5">
              <div className="num text-lg font-semibold">{fmtVal(recebido)}</div>
              <div className="eyebrow mt-1">Recebido</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          <p className="eyebrow mb-3">Pontos por venda</p>
          {!vendas.length ? (
            <Empty>Você ainda não registrou vendas neste evento</Empty>
          ) : (
            vendas.map((v) => (
              <div key={v.id} className="border-b border-border py-3 last:border-0">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <strong className="truncate text-sm font-medium">{v.cliente}</strong>
                  <span className="num shrink-0 rounded-full tint px-2.5 py-0.5 text-xs font-semibold text-accent">
                    +{fmtPts(v.pts)}
                  </span>
                </div>
                <div className="num mb-1.5 text-xs text-muted-foreground">
                  {fmtVal(v.valor)} · {fmtData(v.dataVenda) || fmtHora(v.criadoEm)}
                </div>
                {/* O detalhe fica congelado na venda no momento do registro:
                    mudar a regra depois não reescreve o que já foi pontuado. */}
                <div className="flex flex-wrap gap-1.5">
                  {v.pontosDetalhe.map((d) => (
                    <span
                      key={d.regraId}
                      className={
                        d.pontos !== 0
                          ? "rounded-md border border-accent/30 tint px-2 py-0.5 text-[11px] text-accent"
                          : "rounded-md border border-border px-2 py-0.5 text-[11px] text-muted-foreground opacity-60"
                      }
                    >
                      {d.pontos !== 0 ? "✓ " : ""}
                      {d.label} {d.tag}
                    </span>
                  ))}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </>
  );
}
