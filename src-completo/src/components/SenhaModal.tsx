"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/cliente";
import { Button } from "./ui/button";
import { Field, Input } from "./ui/field";
import { Sheet } from "./ui/sheet";
import { useFeedback } from "./ui/feedback";

/** Troca voluntária de senha (pelo menu). A obrigatória é outra tela. */
export function SenhaModal({ onClose }: { onClose: () => void }) {
  const { toast } = useFeedback();
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirma, setConfirma] = useState("");
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);

  async function trocar() {
    setErro("");
    if (!atual) return setErro("Informe sua senha atual.");
    if (nova.length < 8) return setErro("A nova senha precisa ter pelo menos 8 caracteres.");
    if (nova !== confirma) return setErro("As duas senhas não são iguais.");
    if (nova === atual) return setErro("A nova senha precisa ser diferente da atual.");

    setBusy(true);

    // Confere a senha atual antes de trocar. O Supabase permite `updateUser`
    // só com a sessão aberta — sem esta checagem, um celular destravado e
    // esquecido na mesa deixaria qualquer um mudar a senha do dono.
    const { data: sessao } = await supabase.auth.getUser();
    const email = sessao.user?.email;
    if (!email) {
      setBusy(false);
      return setErro("Sessão expirada. Entre novamente.");
    }

    const { error: erroSenha } = await supabase.auth.signInWithPassword({
      email,
      password: atual,
    });
    if (erroSenha) {
      setBusy(false);
      return setErro("Senha atual incorreta.");
    }

    const { error } = await supabase.auth.updateUser({ password: nova });
    if (error) {
      setBusy(false);
      const m = error.message.toLowerCase();
      return setErro(
        m.includes("should be different")
          ? "A nova senha precisa ser diferente da atual."
          : m.includes("at least") || m.includes("weak")
            ? "Senha muito fraca. Use pelo menos 8 caracteres."
            : "Não foi possível atualizar a senha."
      );
    }

    toast("sucesso", "Senha atualizada.");
    onClose();
  }

  return (
    <Sheet
      titulo="Trocar senha"
      onClose={onClose}
      rodape={
        <Button size="lg" full disabled={busy} onClick={trocar}>
          {busy ? "Salvando..." : "Salvar nova senha"}
        </Button>
      }
    >
      <Field label="Senha atual">
        <Input
          type="password"
          autoComplete="current-password"
          value={atual}
          onChange={(e) => setAtual(e.target.value)}
        />
      </Field>
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
      <p className="min-h-[18px] text-center text-xs text-destructive" role="alert">
        {erro}
      </p>
    </Sheet>
  );
}
