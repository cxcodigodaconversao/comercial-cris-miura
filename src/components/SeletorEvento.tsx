"use client";

import { useState } from "react";
import { Check, Pencil, Plus, Users } from "lucide-react";
import { supabase } from "@/lib/supabase/cliente";
import {
  CORES_MARCA,
  FAIXAS_PADRAO,
  PRODUTOS_PADRAO,
  REGRAS_PADRAO,
  fmtData,
} from "@/lib/config";
import type {
  CriterioDesempate,
  Evento,
  Marca,
  StatusEvento,
  Usuario,
} from "@/lib/types";
import { ImportarParticipantes } from "./ImportarParticipantes";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Empty } from "./ui/card";
import { Field, Input, Select } from "./ui/field";
import { Sheet } from "./ui/sheet";
import { useFeedback } from "./ui/feedback";

const MARCAS: Marca[] = ["IMA_BH", "MENTORIA", "CONGRESSO"];
const STATUS: { valor: StatusEvento; label: string }[] = [
  { valor: "rascunho", label: "Rascunho" },
  { valor: "ativo", label: "Ativo" },
  { valor: "encerrado", label: "Encerrado" },
  { valor: "arquivado", label: "Arquivado" },
];

const TOM_STATUS = {
  ativo: "success",
  rascunho: "warning",
  encerrado: "neutral",
  arquivado: "neutral",
} as const;

export function SeletorEvento({
  eventos,
  atual,
  podeGerir,
  perfil,
  onSelecionar,
  onClose,
}: {
  eventos: Evento[];
  atual: Evento;
  podeGerir: boolean;
  perfil: Usuario;
  onSelecionar: (id: string) => void;
  onClose: () => void;
}) {
  const [editando, setEditando] = useState<Evento | null>(null);
  const [criando, setCriando] = useState(false);
  const [importando, setImportando] = useState<Evento | null>(null);

  if (importando) {
    return <ImportarParticipantes evento={importando} onClose={() => setImportando(null)} />;
  }

  if (criando || editando) {
    return (
      <FormEvento
        evento={editando}
        perfil={perfil}
        onClose={() => {
          setCriando(false);
          setEditando(null);
        }}
      />
    );
  }

  return (
    <Sheet
      titulo="Eventos"
      onClose={onClose}
      rodape={
        podeGerir ? (
          <Button size="lg" full onClick={() => setCriando(true)}>
            <Plus className="h-5 w-5" /> Novo evento
          </Button>
        ) : undefined
      }
    >
      {!eventos.length ? (
        <Empty>
          Nenhum evento cadastrado ainda.
          {podeGerir && (
            <>
              <br />
              <span className="text-xs">Crie o primeiro no botão abaixo.</span>
            </>
          )}
        </Empty>
      ) : (
        eventos.map((e) => {
          const selecionado = e.id === atual.id;
          return (
            <div
              key={e.id}
              className="flex items-center gap-2 border-b border-border py-3 last:border-0"
            >
              <button className="min-w-0 flex-1 text-left" onClick={() => onSelecionar(e.id)}>
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: CORES_MARCA[e.marca] }}
                  />
                  <span className="truncate text-[15px] font-medium">{e.nome}</span>
                  {selecionado && <Check className="h-4 w-4 shrink-0 text-accent" />}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Badge tone={TOM_STATUS[e.status]}>{e.status}</Badge>
                  <span className="num text-xs text-muted-foreground">
                    {fmtData(e.dataInicio)}
                    {e.dataFim && e.dataFim !== e.dataInicio && ` – ${fmtData(e.dataFim)}`}
                  </span>
                  {e.cidade && (
                    <span className="text-xs text-muted-foreground">
                      {e.cidade}
                      {e.uf && `/${e.uf}`}
                    </span>
                  )}
                </div>
              </button>

              {podeGerir && (
                <>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Importar participantes de ${e.nome}`}
                    title="Importar participantes"
                    onClick={() => setImportando(e)}
                  >
                    <Users className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Editar ${e.nome}`}
                    onClick={() => setEditando(e)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          );
        })
      )}
    </Sheet>
  );
}

// ── Cadastro / edição do evento ─────────────────────────────────────────

function FormEvento({
  evento,
  perfil,
  onClose,
}: {
  evento: Evento | null;
  perfil: Usuario;
  onClose: () => void;
}) {
  const { toast } = useFeedback();
  const editando = !!evento;

  const [nome, setNome] = useState(evento?.nome ?? "");
  const [marca, setMarca] = useState<Marca>(evento?.marca ?? "IMA_BH");
  const [cidade, setCidade] = useState(evento?.cidade ?? "");
  const [uf, setUf] = useState(evento?.uf ?? "");
  const [dataInicio, setDataInicio] = useState(evento?.dataInicio ?? "");
  const [dataFim, setDataFim] = useState(evento?.dataFim ?? "");
  const [status, setStatus] = useState<StatusEvento>(evento?.status ?? "rascunho");
  const [desempate, setDesempate] = useState<CriterioDesempate>(evento?.desempate ?? "recebido");
  const [metaFaturamento, setMetaFaturamento] = useState(
    String(evento?.metas?.find((m) => m.escopo === "evento")?.valor ?? "")
  );
  const [linkAnalise, setLinkAnalise] = useState(evento?.linkAnalise ?? "");
  const [linkContratos, setLinkContratos] = useState(evento?.linkContratos ?? "");
  const [busy, setBusy] = useState(false);

  async function salvar() {
    if (!nome.trim()) return toast("aviso", "Dê um nome ao evento.");
    if (!dataInicio) return toast("aviso", "Informe a data de início.");
    if (dataFim && dataFim < dataInicio) {
      return toast("aviso", "A data de fim não pode ser antes da data de início.");
    }

    const meta = parseFloat(metaFaturamento) || 0;
    const metas =
      meta > 0
        ? [{ id: "meta-evento", escopo: "evento", metrica: "faturamento", valor: meta }]
        : [];

    const dados = {
      nome: nome.trim(),
      slug: nome
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "") // tira acento: o slug é chave única
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, ""),
      marca,
      cidade: cidade.trim() || null,
      uf: uf.trim().toUpperCase() || null,
      data_inicio: dataInicio,
      data_fim: dataFim || dataInicio,
      status,
      desempate,
      link_analise: linkAnalise.trim() || null,
      link_contratos: linkContratos.trim().replace(/\/+$/, "") || null,
      metas,
    };

    setBusy(true);

    const { error } = editando
      ? // Não toca em produtos, faixas nem regras: são editados na tela
        // própria de pontuação, e sobrescrever aqui apagaria a configuração.
        await supabase.from("eventos").update(dados).eq("id", evento!.id)
      : await supabase.from("eventos").insert({
          ...dados,
          produtos: PRODUTOS_PADRAO,
          faixas: FAIXAS_PADRAO,
          regras: REGRAS_PADRAO,
          criado_por: perfil.email,
        });

    if (error) {
      setBusy(false);
      return toast(
        "erro",
        "Não foi possível salvar o evento.",
        error.message.includes("eventos_slug_key")
          ? "Já existe um evento com esse nome."
          : error.message
      );
    }

    toast(
      "sucesso",
      editando ? "Evento atualizado." : "Evento criado.",
      editando
        ? undefined
        : "Ele nasce com as faixas e a pontuação padrão — ajuste se este evento pontua diferente."
    );
    onClose();
  }

  return (
    <Sheet
      titulo={editando ? "Editar evento" : "Novo evento"}
      onClose={onClose}
      rodape={
        <Button size="lg" full disabled={busy} onClick={salvar}>
          {busy ? "Salvando..." : editando ? "Salvar alterações" : "Criar evento"}
        </Button>
      }
    >
      <Field label="Nome do evento">
        <Input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Ex: IMA BH Setembro/2026"
        />
      </Field>

      <Field label="Marca" hint="Define a cor de identidade do evento dentro do app.">
        <Select value={marca} onChange={(e) => setMarca(e.target.value as Marca)}>
          {MARCAS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </Select>
      </Field>

      <div className="flex gap-2">
        <Field label="Cidade" className="flex-1">
          <Input
            value={cidade}
            onChange={(e) => setCidade(e.target.value)}
            placeholder="São Paulo"
          />
        </Field>
        <Field label="UF" className="w-20">
          <Input value={uf} maxLength={2} onChange={(e) => setUf(e.target.value)} placeholder="SP" />
        </Field>
      </div>

      <div className="flex gap-2">
        <Field label="Início" className="flex-1">
          <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
        </Field>
        <Field label="Fim" className="flex-1">
          <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
        </Field>
      </div>

      <Field label="Situação">
        <Select value={status} onChange={(e) => setStatus(e.target.value as StatusEvento)}>
          {STATUS.map((s) => (
            <option key={s.valor} value={s.valor}>
              {s.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Meta de faturamento (R$)"
        hint="Aparece no ranking com o quanto falta e a projeção de fechamento."
      >
        <Input
          type="number"
          inputMode="decimal"
          value={metaFaturamento}
          onChange={(e) => setMetaFaturamento(e.target.value)}
          placeholder="0"
        />
      </Field>

      <Field label="Critério de desempate" hint="Usado quando duas pessoas empatam em pontos.">
        <Select
          value={desempate}
          onChange={(e) => setDesempate(e.target.value as CriterioDesempate)}
        >
          <option value="recebido">Maior valor recebido</option>
          <option value="valor">Maior volume vendido</option>
          <option value="vendas">Maior número de vendas</option>
          <option value="primeiro_a_atingir">Quem pontuou primeiro</option>
        </Select>
      </Field>

      <Field
        label="Link do painel de análise (opcional)"
        hint="URL do dashboard externo (Lead Score, check-in etc). Aparece como atalho no menu ☰ para quem vê o evento inteiro."
      >
        <Input
          type="url"
          value={linkAnalise}
          onChange={(e) => setLinkAnalise(e.target.value)}
          placeholder="https://..."
        />
      </Field>

      <Field
        label="Link do sistema de contratos (opcional)"
        hint="URL base do app de assinatura, sem /novo. Preenchido, o botão Contrato de cada venda abre lá o formulário já com os dados da venda."
      >
        <Input
          type="url"
          value={linkContratos}
          onChange={(e) => setLinkContratos(e.target.value)}
          placeholder="https://seudominio.com.br/assinatura-dex"
        />
      </Field>
    </Sheet>
  );
}
