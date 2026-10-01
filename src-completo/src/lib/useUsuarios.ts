"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase/cliente";
import { SELECT_USUARIO } from "./consultas";
import type { Usuario } from "./types";

/**
 * Lista de usuários (o RLS libera leitura para qualquer membro ativo).
 * O ranking precisa dela para mostrar quem está com zero ponto — sem isso,
 * quem ainda não vendeu simplesmente não apareceria no placar.
 */
export function useUsuarios(habilitado = true) {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [carregando, setCarregando] = useState(true);

  const buscar = useCallback(async () => {
    const { data, error } = await supabase.from("usuarios").select(SELECT_USUARIO).order("nome");
    if (!error) setUsuarios((data ?? []) as unknown as Usuario[]);
    setCarregando(false);
  }, []);

  useEffect(() => {
    if (!habilitado) return;
    buscar();

    const canal = supabase
      .channel("usuarios")
      .on("postgres_changes", { event: "*", schema: "public", table: "usuarios" }, () => buscar())
      .subscribe();

    return () => {
      canal.unsubscribe();
    };
  }, [habilitado, buscar]);

  return { usuarios, carregando, recarregar: buscar };
}
