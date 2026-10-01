"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase/cliente";
import { SELECT_VENDA } from "./consultas";
import type { Venda } from "./types";

export type SyncStatus = "" | "ok" | "err";

/**
 * Vendas do EVENTO selecionado, com atualização ao vivo.
 *
 * Não filtra por usuário na consulta: quem decide o que cada um enxerga é o
 * RLS (`vendas_leitura`). Duplicar a regra aqui só criaria uma segunda
 * versão da verdade, que um dia diverge da política e engana quem lê o código.
 */
export function useVendas(eventoId: string | null) {
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [sync, setSync] = useState<SyncStatus>("");
  const [carregando, setCarregando] = useState(true);

  const buscar = useCallback(async () => {
    if (!eventoId) return;
    const { data, error } = await supabase
      .from("vendas")
      .select(SELECT_VENDA)
      .eq("evento_id", eventoId)
      .order("criado_em", { ascending: false });

    if (error) {
      setSync("err");
      return;
    }
    setVendas((data ?? []) as unknown as Venda[]);
    setSync("ok");
    setCarregando(false);
  }, [eventoId]);

  useEffect(() => {
    if (!eventoId) {
      setVendas([]);
      setSync("");
      return;
    }
    setCarregando(true);
    buscar();

    // O evento do Realtime traz a linha crua (snake_case) e sem os apelidos
    // do select. Em vez de traduzir aqui — e manter uma segunda tradução
    // fora do consultas.ts — o evento serve só de gatilho para rebuscar.
    // São dezenas de vendas por evento, não milhares: o custo é irrelevante
    // e o dado na tela é sempre o mesmo que o do banco.
    const canal = supabase
      .channel(`vendas:${eventoId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vendas", filter: `evento_id=eq.${eventoId}` },
        () => buscar()
      )
      .subscribe();

    return () => {
      canal.unsubscribe();
    };
  }, [eventoId, buscar]);

  return { vendas, sync, carregando, recarregar: buscar };
}
