"use client";

import { useRef, useState } from "react";
import { FileSpreadsheet, TriangleAlert, Upload } from "lucide-react";
import { supabase } from "@/lib/supabase/cliente";
import type { Evento } from "@/lib/types";
import { Button } from "./ui/button";
import { Sheet } from "./ui/sheet";
import { useFeedback } from "./ui/feedback";

type Resumo = {
  evento: string;
  linhasNaPlanilha: number;
  importaveis: number;
  novos: number;
  atualizados: number;
  ignoradas: number;
  exemplosIgnorados: { linha: number; nome: string; motivo: string }[];
  colunasDesconhecidas: string[];
  gravados?: number;
};

/**
 * Importa a planilha de participantes do evento — é ela que faz o QR do
 * crachá encontrar alguém na hora de registrar a venda.
 *
 * Duas etapas de propósito: primeiro a PRÉVIA, que diz quantos entram,
 * quantos são novos e o que fica de fora e por quê; a gravação só acontece
 * depois de o admin ver isso. Importação que grava direto esconde o que
 * ficou pelo caminho, e o time só descobre com a fila parada no crachá.
 */
export function ImportarParticipantes({
  evento,
  onClose,
}: {
  evento: Evento;
  onClose: () => void;
}) {
  const { toast } = useFeedback();
  const inputRef = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [gravado, setGravado] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  async function enviar(confirmar: boolean) {
    if (!arquivo) return;
    setOcupado(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Sessão expirada. Entre novamente.");

      const form = new FormData();
      form.append("arquivo", arquivo);
      form.append("eventoId", evento.id);
      if (confirmar) form.append("confirmar", "sim");

      const res = await fetch("/api/leads/importar", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const dados = await res.json();
      if (!res.ok) throw new Error(dados.error || `Erro ${res.status}.`);

      setResumo(dados.resumo);
      if (confirmar) {
        setGravado(true);
        toast(
          "sucesso",
          `${dados.resumo.gravados} participantes importados.`,
          "Os crachás já podem ser lidos no Registrar."
        );
      }
    } catch (e) {
      toast("erro", "Não foi possível importar.", (e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Sheet
      titulo="Importar participantes"
      onClose={onClose}
      rodape={
        gravado ? (
          <Button size="lg" full onClick={onClose}>
            Fechar
          </Button>
        ) : resumo ? (
          <>
            <Button size="lg" full disabled={ocupado} onClick={() => enviar(true)}>
              {ocupado ? "Importando..." : `Confirmar e importar ${resumo.importaveis}`}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              full
              className="mt-2"
              onClick={() => {
                setResumo(null);
                setArquivo(null);
              }}
            >
              Escolher outro arquivo
            </Button>
          </>
        ) : (
          <Button size="lg" full disabled={!arquivo || ocupado} onClick={() => enviar(false)}>
            {ocupado ? "Lendo planilha..." : "Conferir antes de importar"}
          </Button>
        )
      }
    >
      <p className="text-sm leading-relaxed text-muted-foreground">
        Planilha de participantes de <strong className="text-foreground">{evento.nome}</strong>. É
        ela que faz o QR do crachá encontrar a pessoa na hora de registrar a venda.
      </p>

      {!resumo && (
        <>
          <button
            className="mt-4 flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-border-strong bg-background p-6 text-center"
            onClick={() => inputRef.current?.click()}
          >
            {arquivo ? (
              <>
                <FileSpreadsheet className="h-7 w-7 text-accent" />
                <span className="text-sm font-medium break-all">{arquivo.name}</span>
                <span className="num text-xs text-muted-foreground">
                  {(arquivo.size / 1024).toFixed(0)} KB · toque para trocar
                </span>
              </>
            ) : (
              <>
                <Upload className="h-7 w-7 text-muted-foreground" />
                <span className="text-sm font-medium">Escolher planilha</span>
                <span className="text-xs text-muted-foreground">.xlsx até 10 MB</span>
              </>
            )}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => {
              setArquivo(e.target.files?.[0] ?? null);
              setResumo(null);
              setGravado(false);
            }}
          />

          <div className="mt-4 rounded-lg border border-border tint p-3 text-xs leading-relaxed">
            Precisa ter uma coluna com o código do crachá (<strong>eTicket</strong>,{" "}
            <strong>Ticket</strong>, <strong>Código</strong> ou <strong>Crachá</strong>) e uma de{" "}
            <strong>Nome</strong>. As outras — CPF, telefone, e-mail, classificação — entram se
            existirem. Acento e maiúscula no cabeçalho não importam.
          </div>
        </>
      )}

      {resumo && (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <Numero valor={resumo.importaveis} rotulo="entram" destaque />
            <Numero valor={resumo.novos} rotulo="novos" />
            <Numero valor={resumo.atualizados} rotulo="atualizam" />
          </div>

          {resumo.ignoradas > 0 && (
            <div className="rounded-lg border border-warning/30 bg-warning/10 p-3">
              <p className="flex items-center gap-1.5 text-sm font-medium text-warning">
                <TriangleAlert className="h-4 w-4" />
                {resumo.ignoradas} de {resumo.linhasNaPlanilha} linhas ficam de fora
              </p>
              <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                {resumo.exemplosIgnorados.map((i) => (
                  <li key={i.linha}>
                    <span className="num">linha {i.linha}</span> · {i.nome} — {i.motivo}
                  </li>
                ))}
                {resumo.ignoradas > resumo.exemplosIgnorados.length && (
                  <li>e mais {resumo.ignoradas - resumo.exemplosIgnorados.length}…</li>
                )}
              </ul>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Quem ainda não tem crachá emitido entra numa próxima importação — pode subir a
                mesma planilha de novo depois, que não duplica.
              </p>
            </div>
          )}

          {resumo.colunasDesconhecidas.length > 0 && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              Colunas não usadas: {resumo.colunasDesconhecidas.join(", ")}.
            </p>
          )}
        </div>
      )}
    </Sheet>
  );
}

function Numero({
  valor,
  rotulo,
  destaque,
}: {
  valor: number;
  rotulo: string;
  destaque?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-background px-2 py-3 text-center">
      <div className={`num text-xl font-semibold ${destaque ? "text-accent" : ""}`}>{valor}</div>
      <div className="eyebrow mt-1">{rotulo}</div>
    </div>
  );
}
