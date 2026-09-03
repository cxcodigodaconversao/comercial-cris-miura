"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/cliente";
import { Logo } from "./Logo";
import { Button } from "./ui/button";
import { Field, Input } from "./ui/field";

function traduzirErro(mensagem: string) {
  const m = mensagem.toLowerCase();
  // Credencial errada e usuário inexistente devolvem a MESMA mensagem: dizer
  // "usuário não encontrado" confirmaria para um estranho quais e-mails existem.
  if (m.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (m.includes("email not confirmed")) return "Acesso ainda não liberado. Fale com um administrador.";
  if (m.includes("too many requests") || m.includes("rate limit")) {
    return "Muitas tentativas. Aguarde alguns minutos.";
  }
  if (m.includes("failed to fetch") || m.includes("network")) {
    return "Sem conexão. Verifique a internet e tente de novo.";
  }
  return "Não foi possível entrar. Tente novamente.";
}

export function Login({ initialError = "" }: { initialError?: string }) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    const alvo = email.trim().toLowerCase();
    setError("");
    if (!alvo || !senha) return setError("Preencha e-mail e senha.");

    setBusy(true);
    const { error: erro } = await supabase.auth.signInWithPassword({
      email: alvo,
      password: senha,
    });
    if (erro) {
      setBusy(false);
      setError(traduzirErro(erro.message));
    }
    // Sucesso: o useAuth assume daqui e troca a tela.
  }

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center p-6">
      <div className="mb-7 text-center">
        <div className="mb-3 flex justify-center">
          <Logo size={54} />
        </div>
        <h1 className="display text-3xl leading-none">Comercial Cristina Miura</h1>
        <p className="eyebrow mt-2">Vendas · Pontuação · Metas</p>
      </div>

      <form
        onSubmit={entrar}
        className="w-full max-w-[400px] rounded-xl border border-border bg-card card-elev p-6"
      >
        <h2 className="mb-5 text-center text-[15px] font-semibold">Entrar no sistema</h2>

        <Field label="E-mail">
          <Input
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="seu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Senha">
          <Input
            type="password"
            autoComplete="current-password"
            placeholder="Sua senha"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
          />
        </Field>

        <p className="mb-3 min-h-[18px] text-center text-xs text-destructive" role="alert">
          {error}
        </p>

        <Button type="submit" size="lg" full disabled={busy}>
          {busy ? "Entrando..." : "Entrar"}
        </Button>

        {/* A v1 imprimia a senha padrão aqui embaixo. Com e-mails previsíveis
            (especialista1@, especialista2@…), isso era acesso aberto a quem
            visse a tela. Agora cada pessoa recebe uma senha temporária própria. */}
        <p className="mt-4 text-center text-xs leading-relaxed text-muted-foreground">
          Esqueceu a senha? Peça a um administrador para gerar uma nova.
        </p>
      </form>
    </div>
  );
}
