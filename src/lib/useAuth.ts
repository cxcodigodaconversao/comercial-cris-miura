"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabase/cliente";
import { SELECT_USUARIO } from "./consultas";
import type { Usuario } from "./types";

export type AuthState = {
  user: User | null;
  perfil: Usuario | null;
  loading: boolean;
  error: string;
};

/**
 * O perfil sai da tabela `usuarios` — na v1 vinha da constante EMAIL_MAP,
 * que exigia editar código e fazer deploy para cadastrar um vendedor.
 *
 * Reage a mudanças de perfil em tempo real: se um admin desativar alguém ou
 * mudar o papel durante o evento, a tela obedece na hora, sem relogar.
 */
export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    user: null,
    perfil: null,
    loading: true,
    error: "",
  });
  const canalRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const desconectar = useCallback(async (mensagem: string) => {
    await supabase.auth.signOut();
    setState({ user: null, perfil: null, loading: false, error: mensagem });
  }, []);

  useEffect(() => {
    let vivo = true;

    async function carregarPerfil(user: User) {
      const { data, error } = await supabase
        .from("usuarios")
        .select(SELECT_USUARIO)
        .eq("id", user.id)
        .maybeSingle();

      if (!vivo) return;

      if (error) {
        // Sem perfil legível não dá para saber o que a pessoa pode fazer —
        // manter a sessão aberta seria pior que derrubá-la.
        await desconectar("Não foi possível carregar seu perfil. Tente entrar de novo.");
        return;
      }
      if (!data) {
        // Conta existe no Auth mas não na tabela: é o caso de alguém que se
        // cadastrou sozinho. Sem linha em `usuarios`, o RLS já nega tudo.
        await desconectar("Este acesso não está cadastrado no sistema.");
        return;
      }

      const perfil = data as unknown as Usuario;
      if (!perfil.ativo) {
        await desconectar("Seu acesso está desativado. Fale com um administrador.");
        return;
      }

      setState({ user, perfil, loading: false, error: "" });

      // Escuta mudanças no próprio cadastro (papel, ativo, flag de senha).
      canalRef.current?.unsubscribe();
      canalRef.current = supabase
        .channel(`perfil:${user.id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "usuarios", filter: `id=eq.${user.id}` },
          () => carregarPerfil(user)
        )
        .subscribe();
    }

    supabase.auth.getSession().then(({ data }) => {
      if (!vivo) return;
      if (data.session?.user) carregarPerfil(data.session.user);
      else setState({ user: null, perfil: null, loading: false, error: "" });
    });

    const { data: sub } = supabase.auth.onAuthStateChange((evento, session) => {
      if (!vivo) return;
      if (evento === "SIGNED_OUT" || !session?.user) {
        canalRef.current?.unsubscribe();
        canalRef.current = null;
        setState((s) => ({ user: null, perfil: null, loading: false, error: s.error }));
        return;
      }
      // TOKEN_REFRESHED dispara a cada renovação; recarregar o perfil aí
      // seria uma consulta a cada hora sem motivo.
      if (evento === "SIGNED_IN" || evento === "USER_UPDATED") {
        carregarPerfil(session.user);
      }
    });

    return () => {
      vivo = false;
      sub.subscription.unsubscribe();
      canalRef.current?.unsubscribe();
    };
  }, [desconectar]);

  return state;
}
