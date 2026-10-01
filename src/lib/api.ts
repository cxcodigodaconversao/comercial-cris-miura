"use client";

import { supabase } from "./supabase/cliente";

/**
 * Cliente das rotas de API.
 *
 * O access token vai no cabeçalho e é validado no servidor a cada chamada.
 * `getSession()` já renova sozinho quando está perto de expirar, então não
 * é preciso forçar refresh aqui.
 */
async function chamar<T>(url: string, init?: RequestInit): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sessão expirada. Entre novamente.");

  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });

  const texto = await res.text();
  let dados: unknown = null;
  try {
    dados = texto ? JSON.parse(texto) : null;
  } catch {
    // Resposta não-JSON (proxy, timeout, página de erro da plataforma).
    throw new Error(`Resposta inesperada do servidor (${res.status}).`);
  }

  if (!res.ok) {
    throw new Error((dados as { error?: string })?.error || `Erro ${res.status}.`);
  }
  return dados as T;
}

export const api = {
  get: <T>(url: string) => chamar<T>(url),
  post: <T>(url: string, corpo?: unknown) =>
    chamar<T>(url, { method: "POST", body: JSON.stringify(corpo ?? {}) }),
  patch: <T>(url: string, corpo: unknown) =>
    chamar<T>(url, { method: "PATCH", body: JSON.stringify(corpo) }),
  del: <T>(url: string) => chamar<T>(url, { method: "DELETE" }),
};
