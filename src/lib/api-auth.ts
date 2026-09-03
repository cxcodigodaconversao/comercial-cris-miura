import "server-only";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "./supabase/admin";
import type { Papel } from "./types";

/**
 * Porteiro das rotas de API.
 *
 * Nunca confiar em `papel` vindo do corpo da requisição. O token só prova
 * QUEM é a pessoa; o que ela pode fazer vem da tabela `usuarios`, lida aqui
 * no servidor a cada chamada — assim revogar acesso vale na hora, sem
 * esperar token expirar.
 */

export type Chamador = { id: string; email: string; nome: string; papel: Papel };

export class ErroApi extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

export async function autenticar(req: Request): Promise<Chamador> {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw new ErroApi(401, "Requisição sem credencial.");

  const admin = supabaseAdmin();

  const { data: auth, error } = await admin.auth.getUser(token);
  if (error || !auth?.user) {
    throw new ErroApi(401, "Sessão inválida ou expirada. Entre novamente.");
  }

  const { data: perfil } = await admin
    .from("usuarios")
    .select("id, email, nome, papel, ativo")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (!perfil) throw new ErroApi(403, "Acesso não cadastrado no sistema.");
  if (!perfil.ativo) throw new ErroApi(403, "Seu acesso está desativado.");

  return {
    id: perfil.id,
    email: perfil.email,
    nome: perfil.nome,
    papel: perfil.papel as Papel,
  };
}

export async function exigirAdmin(req: Request): Promise<Chamador> {
  const chamador = await autenticar(req);
  if (chamador.papel !== "admin") {
    throw new ErroApi(403, "Só administradores podem gerir usuários.");
  }
  return chamador;
}

/** ErroApi vira resposta; qualquer outra coisa vira 500 sem vazar detalhe interno. */
export function responderErro(e: unknown) {
  if (e instanceof ErroApi) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  console.error("[api/usuarios]", e);
  return NextResponse.json(
    { error: "Erro inesperado no servidor. Tente de novo." },
    { status: 500 }
  );
}
