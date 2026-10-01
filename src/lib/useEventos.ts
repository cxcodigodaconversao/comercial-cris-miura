"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase/cliente";
import { SELECT_EVENTO } from "./consultas";
import { CORES_MARCA, FAIXAS_PADRAO, PRODUTOS_PADRAO, REGRAS_PADRAO } from "./config";
import type { Evento, Usuario } from "./types";

const CHAVE_SELECAO = "ava-cm:evento-selecionado";

/**
 * Evento de emergência: usado só enquanto a tabela `eventos` estiver vazia.
 * Carrega as configurações que a v1 tinha cravadas no código, para o app não
 * ficar inutilizável — mas o id é falso, então o registro de venda fica
 * bloqueado (a chave estrangeira recusaria de qualquer forma).
 */
export const EVENTO_PROVISORIO: Evento = {
  id: "",
  nome: "Nenhum evento cadastrado",
  slug: "sem-evento",
  marca: "IMA_BH",
  cidade: null,
  uf: null,
  local: null,
  dataInicio: "",
  dataFim: "",
  status: "rascunho",
  produtos: PRODUTOS_PADRAO,
  faixas: FAIXAS_PADRAO,
  regras: REGRAS_PADRAO,
  metas: [],
  desempate: "recebido",
  linkAnalise: null,
  linkContratos: null,
  criadoEm: "",
};

export function useEventos(perfil: Usuario | null) {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [selecionado, setSelecionado] = useState<string | null>(null);

  const buscar = useCallback(async () => {
    const { data, error } = await supabase
      .from("eventos")
      .select(SELECT_EVENTO)
      .order("data_inicio", { ascending: false });
    if (!error) setEventos((data ?? []) as unknown as Evento[]);
    setCarregando(false);
  }, []);

  useEffect(() => {
    if (!perfil) return;
    buscar();

    const canal = supabase
      .channel("eventos")
      .on("postgres_changes", { event: "*", schema: "public", table: "eventos" }, () => buscar())
      .subscribe();

    return () => {
      canal.unsubscribe();
    };
  }, [perfil, buscar]);

  // Restaura a última escolha: o vendedor não deve reescolher o evento a
  // cada vez que abre o app no meio do salão.
  useEffect(() => {
    if (typeof window !== "undefined") setSelecionado(localStorage.getItem(CHAVE_SELECAO));
  }, []);

  const selecionar = useCallback((id: string) => {
    setSelecionado(id);
    localStorage.setItem(CHAVE_SELECAO, id);
  }, []);

  const evento = useMemo(() => {
    if (!eventos.length) return EVENTO_PROVISORIO;
    return (
      eventos.find((e) => e.id === selecionado) ??
      // Sem escolha salva, cai no evento ativo mais recente.
      eventos.find((e) => e.status === "ativo") ??
      eventos[0]
    );
  }, [eventos, selecionado]);

  return {
    eventos,
    evento,
    semEventos: !carregando && !eventos.length,
    carregando,
    selecionar,
    recarregar: buscar,
  };
}

/** Aplica a cor da marca do evento em `--brand`, que o logo e os selos usam. */
export function useCorDaMarca(evento: Evento) {
  useEffect(() => {
    const cor = CORES_MARCA[evento.marca] ?? CORES_MARCA.IMA_BH;
    const raiz = document.documentElement;
    raiz.style.setProperty("--brand", cor);
    // A versão fraca precisa acompanhar, senão o chip da marca fica com o
    // fundo de uma cor e o texto de outra.
    raiz.style.setProperty("--brand-weak", corFraca(cor));
  }, [evento.marca]);
}

function corFraca(hex: string, alfa = 0.1) {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alfa})`;
}
