"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Folha que sobe pela base da tela — o padrão de modal no celular: o conteúdo
 * nasce perto do polegar e o teclado não empurra o diálogo para fora da vista.
 */
export function Sheet({
  titulo,
  onClose,
  children,
  rodape,
  className,
}: {
  titulo: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  rodape?: React.ReactNode;
  className?: string;
}) {
  // Esc fecha; enquanto aberta, a página de trás não rola.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = anterior;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-end justify-center bg-foreground/35"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className={cn(
          "w-full max-w-[480px] max-h-[92dvh] flex flex-col rounded-t-2xl border-t border-x border-border bg-card card-elev-lg",
          className
        )}
      >
        <header className="flex items-center justify-between gap-3 px-4 py-3.5 border-b border-border shrink-0">
          <h2 className="display text-lg leading-none">{titulo}</h2>
          <button
            aria-label="Fechar"
            className="h-9 w-9 -mr-1.5 flex items-center justify-center text-muted-foreground rounded-md hover:bg-muted"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>

        {rodape && (
          <footer
            className="px-4 pt-3 border-t border-border shrink-0"
            style={{ paddingBottom: "calc(0.875rem + var(--safe-bottom))" }}
          >
            {rodape}
          </footer>
        )}
      </div>
    </div>
  );
}
