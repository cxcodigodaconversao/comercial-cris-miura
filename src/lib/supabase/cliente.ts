"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente do navegador, criado SOB DEMANDA.
 *
 * Por que preguiçoso e não no topo do módulo: a página é prerenderizada no
 * build, e criar o cliente ali dentro fazia o build inteiro falhar quando
 * faltava variável de ambiente — sendo que a prerenderização de uma tela de
 * login não precisa de Supabase para nada. Agora o cliente só nasce no
 * primeiro uso, que sempre acontece no navegador (dentro de effect ou de
 * handler), nunca na geração estática.
 *
 * A sessão fica no localStorage e se renova sozinha — o vendedor não pode
 * ser deslogado no meio do evento.
 *
 * A autenticação é toda no cliente (o app é uma tela só, mobile). As rotas
 * de API recebem o access token no cabeçalho Authorization e o validam no
 * servidor — por isso não há middleware de sessão em cookie aqui.
 */

/**
 * Variáveis NEXT_PUBLIC_ são substituídas por valor literal em tempo de
 * BUILD. Se faltarem lá, não adianta cadastrar depois: é preciso refazer o
 * deploy. Ver `configuracaoOk()`, usado para avisar isso na tela.
 */
const URL_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const CHAVE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function configuracaoOk() {
  return Boolean(URL_SUPABASE && CHAVE_ANON);
}

let instancia: SupabaseClient | null = null;

function criar(): SupabaseClient {
  if (!URL_SUPABASE || !CHAVE_ANON) {
    throw new Error(
      "Supabase não configurado: faltam NEXT_PUBLIC_SUPABASE_URL e/ou " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY no build."
    );
  }
  return createClient(URL_SUPABASE, CHAVE_ANON, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
}

/**
 * Proxy para o cliente real. Mantém a forma `supabase.from(...)` em todos os
 * lugares que já usam, sem transformar cada chamada num `getSupabase()`.
 */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_alvo, prop, receptor) {
    instancia ??= criar();
    const valor = Reflect.get(instancia, prop, receptor);
    return typeof valor === "function" ? valor.bind(instancia) : valor;
  },
});
