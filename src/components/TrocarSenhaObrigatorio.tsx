"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { supabase } from "@/lib/supabase/cliente";
import type { Usuario } from "@/lib/types";
import { Button } from "./ui/button";
import { Field, Input } from "./ui/field";

/**
 * Portão da senha temporária. Enquanto `precisaTrocarSenha` for verdadeiro,
 * é a única tela que a pessoa vê — a senha que o admin ditou em voz alta no
 * corredor não pode continuar valendo depois do primeiro acesso.
 *
 * Não pede a senha atual: o usuário acabou de entrar com ela, então já está
 * autenticado, e pedir de novo só aumenta a chance de ele desistir.
 */
export function TrocarSenhaObrigatorio({ perfil }: { perfil: Usuario }) {
  const [nova, setNova] = useState("");
  const [confirma, setConfirma] = useState("");
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    if (nova.length < 8) return setErro("A nova senha precisa ter pelo menos 8 caracteres.");
    if (nova !== confirma) return setErro("As duas senhas não são iguais.");

    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: nova });
    if (error) {
      setBusy(false);
      const m = error.message.toLowerCase();
      return setErro(
        m.includes("should be different")
          ? "A nova senha precisa ser diferente da temporária."
          : m.includes("at least") || m.includes("weak")
            ? "Senha muito fraca. Use pelo menos 8 caracteres."
            : "Não foi possível salvar a senha. Tente de novo."
      );
    }

    // O RLS permite exatamente esta escrita e nada mais: a política deixa o
    // usuário baixar a própria flag, e um trigger recusa qualquer outra
    // coluna na mesma instrução.
    const { error: erroFlag } = await supabase
      .from("usuarios")
      .update({ precisa_trocar_senha: false })
      .eq("id", perfil.id);

    if (erroFlag) {
      setBusy(false);
      setErro("Senha alterada, mas houve falha ao liberar o acesso. Saia e entre de novo.");
    }
    // Sucesso: o canal de tempo real do useAuth percebe a mudança e libera o app.
  }

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center p-6">
      <form
        onSubmit={salvar}
        className="w-full max-w-[400px] rounded-xl border border-border bg-card card-elev p-6"
      >
        <div className="mb-4 flex items-center gap-2.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg tint">
            <KeyRound className="h-5 w-5 text-accent" />
          </span>
          <div>
            <h1 className="display text-xl leading-tight">Crie sua senha</h1>
            <p className="text-xs text-muted-foreground">Olá, {perfil.nome.split(" ")[0]}</p>
          </div>
        </div>

        <p className="mb-5 text-sm leading-relaxed text-muted-foreground">
          Você entrou com uma senha temporária. Defina uma senha só sua para continuar.
        </p>

        <Field label="Nova senha">
          <Input
            type="password"
            autoComplete="new-password"
            placeholder="Mínimo 8 caracteres"
            value={nova}
            onChange={(e) => setNova(e.target.value)}
          />
        </Field>
        <Field label="Repita a nova senha">
          <Input
            type="password"
            autoComplete="new-password"
            value={confirma}
            onChange={(e) => setConfirma(e.target.value)}
          />
        </Field>

        <p className="mb-3 min-h-[18px] text-center text-xs text-destructive" role="alert">
          {erro}
        </p>

        <Button type="submit" size="lg" full disabled={busy}>
          {busy ? "Salvando..." : "Salvar e entrar"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          full
          className="mt-2"
          onClick={() => supabase.auth.signOut()}
        >
          Sair
        </Button>
      </form>
    </div>
  );
}
