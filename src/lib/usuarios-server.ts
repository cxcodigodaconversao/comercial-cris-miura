import "server-only";
import { randomInt } from "node:crypto";
import { supabaseAdmin } from "./supabase/admin";
import { ErroApi } from "./api-auth";
import type { Papel } from "./types";

export const PAPEIS: Papel[] = ["admin", "gestor", "closer"];

/**
 * Senha temporária legível: o admin vai ditar isso por WhatsApp ou em voz
 * alta no corredor do evento. Sem caracteres ambíguos (0/O, 1/l/I) e com
 * troca obrigatória no primeiro acesso, então o que importa é ser
 * transmissível sem erro.
 */
export function gerarSenhaTemporaria() {
  const letras = "ABCDEFGHJKMNPQRSTUVWXYZ";
  const numeros = "23456789";
  const bloco = (fonte: string, n: number) =>
    Array.from({ length: n }, () => fonte[randomInt(fonte.length)]).join("");
  return `Ava-${bloco(letras, 3)}${bloco(numeros, 4)}`;
}

export function normalizarEmail(email: unknown): string {
  const e = String(email ?? "")
    .trim()
    .toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new ErroApi(400, "E-mail inválido.");
  return e;
}

export function validarPapel(papel: unknown): Papel {
  if (!PAPEIS.includes(papel as Papel)) {
    throw new ErroApi(400, `Papel inválido. Use um de: ${PAPEIS.join(", ")}.`);
  }
  return papel as Papel;
}

/**
 * Impede que o sistema fique sem ninguém capaz de gerir usuários.
 * Sem esta trava, um clique errado tranca a gestão para sempre e só se
 * resolve com acesso ao banco.
 */
export async function garantirQueSobraAdmin(idAlvo: string) {
  const { count } = await supabaseAdmin()
    .from("usuarios")
    .select("id", { count: "exact", head: true })
    .eq("papel", "admin")
    .eq("ativo", true)
    .neq("id", idAlvo);

  if (!count) {
    throw new ErroApi(400, "Este é o último administrador ativo. Promova outro antes.");
  }
}

/** Quantas vendas o usuário tem — a guarda da exclusão. */
export async function contarVendas(id: string): Promise<number> {
  const { count } = await supabaseAdmin()
    .from("vendas")
    .select("id", { count: "exact", head: true })
    .eq("usuario_id", id);
  return count ?? 0;
}

/** Mensagens do Supabase em inglês não servem para o admin em campo. */
export function traduzirErro(mensagem: string): string {
  const m = mensagem.toLowerCase();
  if (m.includes("already been registered") || m.includes("already exists") || m.includes("duplicate")) {
    return "Já existe um usuário com este e-mail.";
  }
  if (m.includes("invalid email")) return "E-mail inválido.";
  if (m.includes("password") && m.includes("least")) {
    return "A senha precisa ter pelo menos 6 caracteres.";
  }
  if (m.includes("user not found")) return "Usuário não encontrado.";
  return mensagem;
}
