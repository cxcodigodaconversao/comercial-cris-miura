"use client";

import { TriangleAlert } from "lucide-react";

/**
 * Mostrada quando o app subiu sem as variáveis do Supabase.
 *
 * Não é tela para o vendedor — é para quem está publicando. Por isso ela diz
 * o nome exato das variáveis e o passo que quase todo mundo esquece: as
 * `NEXT_PUBLIC_` viram valor literal durante o BUILD, então cadastrar sem
 * refazer o deploy não muda nada.
 */
export function ConfiguracaoFaltando() {
  const faltando = [
    !process.env.NEXT_PUBLIC_SUPABASE_URL && "NEXT_PUBLIC_SUPABASE_URL",
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  ].filter(Boolean) as string[];

  return (
    <div className="flex min-h-[100dvh] items-center justify-center p-6">
      <div className="w-full max-w-[460px] rounded-xl border border-border bg-card card-elev p-6">
        <div className="mb-4 flex items-center gap-2.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-warning/12">
            <TriangleAlert className="h-5 w-5 text-warning" />
          </span>
          <h1 className="display text-xl leading-tight">Configuração incompleta</h1>
        </div>

        <p className="text-sm leading-relaxed text-muted-foreground">
          O app subiu sem as chaves do Supabase, então não consegue autenticar ninguém.
          {faltando.length === 1 ? " Falta esta variável:" : " Faltam estas variáveis:"}
        </p>

        <ul className="my-4 space-y-1.5">
          {faltando.map((v) => (
            <li
              key={v}
              className="num rounded-md border border-border bg-background px-3 py-2 text-[13px] break-all"
            >
              {v}
            </li>
          ))}
        </ul>

        <p className="text-sm leading-relaxed text-muted-foreground">
          Cadastre em <strong className="text-foreground">Settings → Environment Variables</strong>,
          marcando <strong className="text-foreground">Production, Preview e Development</strong>, e
          então <strong className="text-foreground">refaça o deploy</strong>.
        </p>

        <p className="mt-3 rounded-lg border border-border tint p-3 text-xs leading-relaxed">
          Refazer o deploy não é opcional: variáveis <code>NEXT_PUBLIC_</code> viram valor fixo
          durante o build. Cadastrar sem reconstruir mantém esta tela.
        </p>
      </div>
    </div>
  );
}
