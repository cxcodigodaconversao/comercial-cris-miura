"use client";

import { useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeScannerState } from "html5-qrcode";
import { X } from "lucide-react";

/**
 * Leitor de QR do crachá. Ao decodificar, devolve o texto lido (o ID do lead).
 * Precisa de HTTPS + permissão de câmera — em localhost e na Vercel funciona.
 */
export function QrScanner({
  onRead,
  onClose,
}: {
  onRead: (text: string) => void;
  onClose: () => void;
}) {
  const regionId = "qr-region";
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const doneRef = useRef(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    const scanner = new Html5Qrcode(regionId, { verbose: false });
    scannerRef.current = scanner;

    // Para a câmera de forma segura: só chama stop() se estiver rodando,
    // e engole qualquer erro (síncrono OU assíncrono) pra não derrubar o app.
    const safeStop = async () => {
      try {
        const st = scanner.getState?.();
        if (st === Html5QrcodeScannerState.SCANNING || st === Html5QrcodeScannerState.PAUSED) {
          await scanner.stop();
        }
      } catch {
        /* já parado / DOM removido — ignora */
      }
    };

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (text) => {
          if (doneRef.current) return;
          doneRef.current = true;
          safeStop().finally(() => onRead(String(text).trim()));
        },
        () => {} // ignora frames sem QR
      )
      .catch((e) =>
        setErro(
          "Não foi possível abrir a câmera. Verifique a permissão no navegador. " +
            (e?.message || e)
        )
      );

    return () => {
      doneRef.current = true;
      void safeStop();
    };
  }, [onRead]);

  return (
    <div className="fixed inset-0 z-[150] flex flex-col items-center justify-center bg-ink/85 p-5">
      <div className="w-full max-w-[340px] rounded-xl border border-border bg-card card-elev-lg p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="display text-lg leading-none">Ler crachá</span>
          <button
            aria-label="Fechar"
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div id={regionId} className="w-full overflow-hidden rounded-lg bg-muted" />

        {erro ? (
          <p className="mt-3 text-center text-xs leading-relaxed text-destructive">{erro}</p>
        ) : (
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Aponte para o QR code do crachá do lead.
          </p>
        )}
      </div>
    </div>
  );
}
