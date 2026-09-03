"use client";

import { useMemo } from "react";
import { Medal } from "lucide-react";
import { fmtPts, fmtVal } from "@/lib/config";
import type { Evento, Venda } from "@/lib/types";
import { useUsuarios } from "@/lib/useUsuarios";
import { Card, CardContent, Empty } from "./ui/card";
import { ProgressoMeta } from "./ProgressoMeta";

type Linha = {
  usuarioId: string;
  nome: string;
  pts: number;
  vendas: number;
  volume: number;
  recebido: number;
  primeiroEm: number;
};

const MEDALHAS = ["#B08D3F", "#8C8C8C", "#9C6B4A"];

export function Ranking({ vendas, evento }: { vendas: Venda[]; evento: Evento }) {
  const { usuarios } = useUsuarios();

  const { linhas, maxPts, totais } = useMemo(() => {
    const porUsuario = new Map<string, Linha>();

    // Semeia com quem está ativo: sem isso, quem ainda não vendeu some do
    // ranking em vez de aparecer com zero.
    for (const u of usuarios) {
      if (!u.ativo) continue;
      porUsuario.set(u.id, {
        usuarioId: u.id,
        nome: u.nome,
        pts: 0,
        vendas: 0,
        volume: 0,
        recebido: 0,
        primeiroEm: Infinity,
      });
    }

    for (const v of vendas) {
      let linha = porUsuario.get(v.usuarioId);
      if (!linha) {
        // Venda de alguém desativado: o nome está no próprio registro, então
        // o histórico do evento continua completo.
        linha = {
          usuarioId: v.usuarioId,
          nome: v.closerNome || "(sem cadastro)",
          pts: 0,
          vendas: 0,
          volume: 0,
          recebido: 0,
          primeiroEm: Infinity,
        };
        porUsuario.set(v.usuarioId, linha);
      }
      linha.pts += v.pts || 0;
      linha.vendas += 1;
      linha.volume += v.valor || 0;
      linha.recebido += v.recebido || 0;
      linha.primeiroEm = Math.min(linha.primeiroEm, new Date(v.criadoEm).getTime());
    }

    // Critério de desempate configurado no evento.
    const desempatar = (a: Linha, b: Linha) => {
      switch (evento.desempate) {
        case "valor":
          return b.volume - a.volume;
        case "vendas":
          return b.vendas - a.vendas;
        case "primeiro_a_atingir":
          return a.primeiroEm - b.primeiroEm;
        default:
          return b.recebido - a.recebido;
      }
    };

    const linhas = [...porUsuario.values()].sort((a, b) => b.pts - a.pts || desempatar(a, b));

    return {
      linhas,
      maxPts: linhas[0]?.pts || 0,
      totais: {
        vendas: vendas.length,
        pts: vendas.reduce((a, v) => a + (v.pts || 0), 0),
        volume: vendas.reduce((a, v) => a + (v.valor || 0), 0),
        recebido: vendas.reduce((a, v) => a + (v.recebido || 0), 0),
      },
    };
  }, [vendas, usuarios, evento.desempate]);

  const rotuloDesempate = {
    recebido: "maior valor recebido",
    valor: "maior volume vendido",
    vendas: "maior número de vendas",
    primeiro_a_atingir: "quem pontuou primeiro",
  }[evento.desempate];

  return (
    <>
      <ProgressoMeta evento={evento} vendas={vendas} />

      <Card className="mb-3">
        <CardContent className="pt-4">
          <div className="flex gap-2">
            <Total valor={String(totais.vendas)} rotulo="Vendas" />
            <Total valor={fmtPts(totais.pts)} rotulo="Pontos" />
          </div>
          {/* Dinheiro em linha própria: cabem os dois valores por extenso
              mesmo no celular, sem espremer as contagens acima. */}
          <div className="mt-3 flex gap-2 border-t border-border pt-3">
            <Total valor={fmtVal(totais.volume)} rotulo="Volume" />
            <Total valor={fmtVal(totais.recebido)} rotulo="Cash collected" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-2">
          {!linhas.length ? (
            <Empty>Nenhuma venda registrada neste evento</Empty>
          ) : (
            linhas.map((l, i) => (
              <div
                key={l.usuarioId}
                className="flex items-center gap-3 border-b border-border py-3 last:border-0"
              >
                <span className="num w-6 shrink-0 text-center text-sm text-muted-foreground">
                  {i < 3 && l.pts > 0 ? (
                    <Medal
                      className="mx-auto h-5 w-5"
                      style={{ color: MEDALHAS[i] }}
                      aria-label={`${i + 1}º lugar`}
                    />
                  ) : (
                    i + 1
                  )}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="truncate text-[15px] font-medium">{l.nome}</span>
                    <span className="num shrink-0 text-xs text-muted-foreground">{l.vendas}v</span>
                    <span className="num ml-auto shrink-0 text-base font-semibold text-accent">
                      {fmtPts(l.pts)}
                    </span>
                  </div>
                  <div className="num mt-0.5 text-xs text-muted-foreground">
                    Recebido: {fmtVal(l.recebido)}
                  </div>
                  <div className="mt-1.5 h-1 rounded-full bg-muted">
                    <div
                      className="h-1 rounded-full bg-accent transition-all"
                      style={{ width: `${maxPts > 0 ? Math.round((l.pts / maxPts) * 100) : 0}%` }}
                    />
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <p className="mt-3 px-1 text-xs leading-relaxed text-muted-foreground">
        Empate na pontuação é desfeito por <strong className="font-medium">{rotuloDesempate}</strong>.
      </p>
    </>
  );
}

function Total({ valor, rotulo }: { valor: string; rotulo: string }) {
  return (
    <div className="flex-1 text-center">
      <div className="num text-lg font-semibold text-accent">{valor}</div>
      <div className="eyebrow mt-0.5">{rotulo}</div>
    </div>
  );
}
