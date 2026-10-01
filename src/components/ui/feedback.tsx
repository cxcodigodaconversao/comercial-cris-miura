"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { Button } from "./button";
import { cn } from "@/lib/utils";

/**
 * Substitui `alert()` e `confirm()`, que a v1 usava em 8 lugares — incluindo
 * a exclusão de venda. Além de destoar do design system, o `confirm()` nativo
 * some atrás do teclado no mobile e não dá para explicar a consequência.
 */

type Tipo = "sucesso" | "erro" | "aviso" | "info";
type Toast = { id: number; tipo: Tipo; titulo: string; detalhe?: string };

type ConfirmOpts = {
  titulo: string;
  descricao?: React.ReactNode;
  confirmar?: string;
  cancelar?: string;
  perigo?: boolean;
};

type Ctx = {
  toast: (tipo: Tipo, titulo: string, detalhe?: string) => void;
  confirmar: (opts: ConfirmOpts) => Promise<boolean>;
};

const FeedbackCtx = React.createContext<Ctx | null>(null);

export function useFeedback() {
  const ctx = React.useContext(FeedbackCtx);
  if (!ctx) throw new Error("useFeedback precisa estar dentro de <FeedbackProvider>");
  return ctx;
}

const ICONES: Record<Tipo, React.ElementType> = {
  sucesso: CheckCircle2,
  erro: XCircle,
  aviso: AlertTriangle,
  info: Info,
};

const CORES: Record<Tipo, string> = {
  sucesso: "text-success",
  erro: "text-destructive",
  aviso: "text-warning",
  info: "text-accent",
};

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const [pedido, setPedido] = React.useState<
    (ConfirmOpts & { resolve: (v: boolean) => void }) | null
  >(null);
  const seq = React.useRef(0);

  const toast = React.useCallback((tipo: Tipo, titulo: string, detalhe?: string) => {
    const id = ++seq.current;
    setToasts((t) => [...t, { id, tipo, titulo, detalhe }]);
    // Erro fica mais tempo: costuma ter texto para ler.
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tipo === "erro" ? 7000 : 4000);
  }, []);

  const confirmar = React.useCallback(
    (opts: ConfirmOpts) => new Promise<boolean>((resolve) => setPedido({ ...opts, resolve })),
    []
  );

  function fechar(valor: boolean) {
    pedido?.resolve(valor);
    setPedido(null);
  }

  return (
    <FeedbackCtx.Provider value={{ toast, confirmar }}>
      {children}

      {/* Toasts — ancorados no topo para não brigar com o teclado do celular */}
      <div className="fixed inset-x-0 top-0 z-50 flex flex-col items-center gap-2 p-3 pointer-events-none">
        {toasts.map((t) => {
          const Icone = ICONES[t.tipo];
          return (
            <div
              key={t.id}
              role="status"
              className="pointer-events-auto w-full max-w-[456px] rounded-xl border border-border bg-card card-elev-lg p-3 flex items-start gap-2.5"
            >
              <Icone className={cn("h-5 w-5 shrink-0 mt-px", CORES[t.tipo])} aria-hidden />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium leading-snug">{t.titulo}</div>
                {t.detalhe && (
                  <div className="text-xs text-muted-foreground mt-0.5 break-words">{t.detalhe}</div>
                )}
              </div>
              <button
                aria-label="Fechar aviso"
                className="text-muted-foreground shrink-0"
                onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Confirmação */}
      {pedido && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-foreground/35 p-3"
          onClick={() => fechar(false)}
        >
          <div
            className="w-full max-w-[420px] rounded-xl border border-border bg-card card-elev-lg p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="display text-xl leading-snug">{pedido.titulo}</h2>
            {pedido.descricao && (
              <div className="mt-2 text-sm text-muted-foreground leading-relaxed">
                {pedido.descricao}
              </div>
            )}
            <div className="mt-5 flex gap-2">
              <Button variant="outline" full onClick={() => fechar(false)}>
                {pedido.cancelar ?? "Cancelar"}
              </Button>
              <Button
                variant={pedido.perigo ? "danger" : "primary"}
                full
                onClick={() => fechar(true)}
              >
                {pedido.confirmar ?? "Confirmar"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </FeedbackCtx.Provider>
  );
}
