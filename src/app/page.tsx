"use client";

import { useAuth } from "@/lib/useAuth";
import { configuracaoOk } from "@/lib/supabase/cliente";
import { Login } from "@/components/Login";
import { AppShell } from "@/components/AppShell";
import { TrocarSenhaObrigatorio } from "@/components/TrocarSenhaObrigatorio";
import { ConfiguracaoFaltando } from "@/components/ConfiguracaoFaltando";
import { FeedbackProvider } from "@/components/ui/feedback";

export default function Home() {
  const { user, perfil, loading, error } = useAuth();

  // Deploy sem as variáveis do Supabase: em vez de uma tela branca com erro
  // no console, diz o que falta e onde arrumar.
  if (!configuracaoOk()) return <ConfiguracaoFaltando />;

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-accent" />
        <p className="eyebrow">Verificando sessão</p>
      </div>
    );
  }

  if (!user || !perfil) return <Login initialError={error} />;

  return (
    <FeedbackProvider>
      {/* Senha temporária (cadastro ou reset) não libera o app antes da troca. */}
      {perfil.precisaTrocarSenha ? (
        <TrocarSenhaObrigatorio perfil={perfil} />
      ) : (
        <AppShell perfil={perfil} />
      )}
    </FeedbackProvider>
  );
}
