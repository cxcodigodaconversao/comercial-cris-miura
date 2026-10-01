import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente com a service role: IGNORA o RLS e pode usar a Admin API do Auth.
 *
 * Existe por um motivo específico: criar, desativar e excluir usuário não
 * pode acontecer no navegador. O `signUp` do cliente troca a sessão corrente
 * pela do usuário recém-criado — o admin seria deslogado e entraria como o
 * vendedor que acabou de cadastrar.
 *
 * ⚠️ Só pode ser importado por código de servidor (o `server-only` acima
 * transforma um import no cliente em erro de build, não em vazamento).
 */
let cache: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (cache) return cache;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !chave) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY (ou NEXT_PUBLIC_SUPABASE_URL) não configurada. " +
        "Sem ela a gestão de usuários não funciona. Cadastre nas variáveis de ambiente."
    );
  }

  cache = createClient(url, chave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cache;
}
