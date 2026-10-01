"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Instagram, MessageCircle, Search, Send } from "lucide-react";
import { supabase } from "@/lib/supabase/cliente";
import { SELECT_ABORDAGEM, SELECT_INSCRITO } from "@/lib/consultas";
import { fmtVal } from "@/lib/config";
import { normalizarEmail, type Classe, type Inscrito } from "@/lib/analise";
import {
  abordagensPorEmail,
  detalhesDe,
  filtrarParticipantes,
  linkInstagram,
  linkWhatsapp,
  ordenarParticipantes,
} from "@/lib/participantes";
import type { Abordagem, Evento, Usuario, Venda } from "@/lib/types";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, Empty, SectionLabel } from "./ui/card";
import { Field, Input, Textarea } from "./ui/field";
import { useFeedback } from "./ui/feedback";

/**
 * Aba Participantes — a lista de inscritos do painel, pesquisável, com a
 * ficha completa de cada um e os atalhos de contato.
 *
 * É a tela que o closer abre antes de abordar alguém: quem é, que classe
 * de Lead Score tem, o que respondeu no formulário, se já comprou. Por isso
 * a lista é ordenada por classe (melhor primeiro) e não alfabeticamente.
 *
 * A busca roda toda no cliente: são ~500 registros já carregados, e ir ao
 * banco a cada tecla deixaria a digitação travada no celular do salão.
 */
export function Participantes({ evento, vendas, perfil }: { evento: Evento; vendas: Venda[]; perfil: Usuario }) {
  const { toast } = useFeedback();
  const [inscritos, setInscritos] = useState<Inscrito[] | null>(null);
  const [termo, setTermo] = useState("");
  const [aberto, setAberto] = useState<Inscrito | null>(null);
  const [abordagens, setAbordagens] = useState<Abordagem[]>([]);

  useEffect(() => {
    setInscritos(null);
    setAberto(null);
    setTermo("");
    (async () => {
      const { data, error } = await supabase
        .from("inscritos")
        .select(SELECT_INSCRITO)
        .eq("evento_id", evento.id);
      if (error) return toast("erro", "Não foi possível carregar os participantes.", error.message);
      setInscritos((data ?? []) as unknown as Inscrito[]);
      const { data: abs } = await supabase
        .from("abordagens")
        .select(SELECT_ABORDAGEM)
        .eq("evento_id", evento.id);
      setAbordagens((abs ?? []) as unknown as Abordagem[]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evento.id]);

  /** E-mails que já compraram — o selo "Comprou" na lista sai daqui. */
  const compradores = useMemo(() => {
    const m = new Map<string, Venda[]>();
    for (const v of vendas) {
      const e = normalizarEmail(v.email);
      if (e) m.set(e, [...(m.get(e) ?? []), v]);
    }
    return m;
  }, [vendas]);

  const porEmail = useMemo(() => abordagensPorEmail(abordagens), [abordagens]);

  async function registrarAbordagem(email: string, observacao: string) {
    const { data, error } = await supabase
      .from("abordagens")
      .insert({
        evento_id: evento.id,
        email,
        usuario_id: perfil.id,
        por_nome: perfil.nome,
        observacao: observacao.trim(),
      })
      .select(SELECT_ABORDAGEM)
      .single();
    if (error) {
      toast("erro", "Não foi possível salvar a observação.", error.message);
      return false;
    }
    setAbordagens((a) => [...a, data as unknown as Abordagem]);
    toast("sucesso", "Abordagem registrada.");
    return true;
  }

  const lista = useMemo(
    () => (inscritos ? ordenarParticipantes(filtrarParticipantes(inscritos, termo)) : []),
    [inscritos, termo]
  );

  if (inscritos === null) return <Empty>Carregando…</Empty>;
  if (!inscritos.length) {
    return <Empty>Nenhum participante importado. Um admin pode subir o painel na aba Análise.</Empty>;
  }

  if (aberto) {
    return (
      <Ficha
        inscrito={aberto}
        vendas={compradores.get(aberto.email) ?? []}
        abordagens={porEmail.get(aberto.email) ?? []}
        onRegistrar={(obs) => registrarAbordagem(aberto.email, obs)}
        onVoltar={() => setAberto(null)}
      />
    );
  }

  return (
    <>
      <Card className="mb-3">
        <CardContent className="pt-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
              placeholder="Nome, e-mail, telefone ou @instagram"
              className="pl-9"
              autoComplete="off"
            />
          </div>
          <p className="mt-2 text-xs text-muted">
            {lista.length} de {inscritos.length} participante{inscritos.length === 1 ? "" : "s"}
            {termo ? " (filtrado)" : ""}
          </p>
        </CardContent>
      </Card>

      {lista.length === 0 ? (
        <Empty>Ninguém encontrado com “{termo}”.</Empty>
      ) : (
        <Card>
          <CardContent className="divide-y divide-border pt-0">
            {lista.map((i) => (
              <button
                key={i.email}
                onClick={() => setAberto(i)}
                className="flex w-full items-center gap-3 py-3 text-left"
              >
                <ClasseSelo classe={i.classe} nota={i.nota} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{i.nome}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {i.checkinFeito ? "Presente" : "Sem check-in"}
                    {i.jaAluno ? " · Já aluno" : ""}
                    {i.contatoConfirmou === "Confirmou" ? " · Confirmou" : ""}
                  </span>
                  {/* Quem fechou aparece embaixo do nome: na lista cheia é o que
                      o time pergunta primeiro ("quem já pegou essa?"). */}
                  {!compradores.has(i.email) && porEmail.has(i.email) && (
                    <span className="block truncate text-xs text-muted-foreground">
                      Abordado por {porEmail.get(i.email)![0].porNome}
                    </span>
                  )}
                  {compradores.get(i.email)?.[0] && (
                    <span className="block truncate text-xs text-success">
                      Vendido por {compradores.get(i.email)![0].closerNome}
                    </span>
                  )}
                </span>
                {compradores.has(i.email) && <Badge tone="success">Comprou</Badge>}
              </button>
            ))}
          </CardContent>
        </Card>
      )}
    </>
  );
}

// ── Ficha individual ───────────────────────────────────────────────────

function Ficha({
  inscrito: i,
  vendas,
  abordagens,
  onRegistrar,
  onVoltar,
}: {
  inscrito: Inscrito;
  vendas: Venda[];
  abordagens: Abordagem[];
  onRegistrar: (observacao: string) => Promise<boolean>;
  onVoltar: () => void;
}) {
  const wa = linkWhatsapp(i.whatsapp);
  const ig = linkInstagram(i.extras.instagram);
  const detalhes = detalhesDe(i);
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (!texto.trim()) return;
    setSalvando(true);
    if (await onRegistrar(texto)) setTexto("");
    setSalvando(false);
  }

  return (
    <>
      <Button variant="ghost" size="sm" className="mb-2" onClick={onVoltar}>
        <ArrowLeft className="h-4 w-4" /> Todos os participantes
      </Button>

      <Card className="mb-3">
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <ClasseSelo classe={i.classe} nota={i.nota} grande />
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-medium leading-tight">{i.nome}</h2>
              <p className="num mt-1 break-all text-xs text-muted">{i.email}</p>
              {i.whatsapp && <p className="num text-xs text-muted">{i.whatsapp}</p>}
            </div>
          </div>

          {(wa || ig) && (
            <div className="mt-3 flex gap-2">
              {wa && (
                <Button variant="accent" full onClick={() => window.open(wa, "_blank", "noopener,noreferrer")}>
                  <MessageCircle className="h-4 w-4" /> WhatsApp
                </Button>
              )}
              {ig && (
                <Button variant="outline" full onClick={() => window.open(ig, "_blank", "noopener,noreferrer")}>
                  <Instagram className="h-4 w-4" /> Instagram
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mb-3">
        <CardContent className="pt-4">
          <SectionLabel>Abordagem</SectionLabel>
          <Field label="O que foi conversado" hint="Fica registrado no seu nome, visível para o time.">
            <Textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={3}
              placeholder="Resumo da conversa, objeções, próximo passo…"
            />
          </Field>
          <Button variant="accent" full className="mt-2" disabled={salvando || !texto.trim()} onClick={salvar}>
            <Send className="h-4 w-4" /> {salvando ? "Salvando..." : "Registrar abordagem"}
          </Button>

          {abordagens.length > 0 && (
            <div className="mt-4 space-y-3 border-t border-border pt-3">
              {abordagens.map((a) => (
                <div key={a.id}>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{a.porNome}</span>
                    {" · "}
                    {new Date(a.em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm">{a.observacao}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {vendas.length > 0 && (
        <Card className="mb-3 border-accent">
          <CardContent className="pt-4">
            <SectionLabel>Já comprou</SectionLabel>
            {vendas.map((v) => (
              <p key={v.id} className="mt-1 text-sm">
                <span className="num font-medium">{fmtVal(v.valor)}</span>
                <span className="text-muted"> · {v.closerNome}</span>
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="mb-3">
        <CardContent className="pt-4">
          <SectionLabel>Lead Score</SectionLabel>
          <div className="mt-2 flex gap-2">
            <Num valor={i.nota !== null ? String(i.nota) : "—"} rotulo="Nota" />
            <Num valor={i.perfil !== null ? String(i.perfil) : "—"} rotulo="Perfil" />
            <Num valor={i.comprometimento !== null ? String(i.comprometimento) : "—"} rotulo="Compromet." />
          </div>
          {i.classe === "X" && (
            <p className="mt-2 text-xs text-muted">Não respondeu o formulário de perfil — sem nota.</p>
          )}
        </CardContent>
      </Card>

      <Card className="mb-3">
        <CardContent className="pt-4">
          <SectionLabel>Perfil</SectionLabel>
          <Linha label="Faturamento" valor={i.faturamento} />
          <Linha label="Tempo de formado(a)" valor={i.tempoFormado} />
          <Linha label="Área de atuação" valor={i.areaAtuacao} />
          <Linha label="Faixa etária" valor={i.idade} />
          <Linha label="Já é aluno(a)" valor={i.jaAluno === null ? null : i.jaAluno ? "Sim" : "Não"} />
          <Linha label="Ingresso" valor={i.categoriaTicket} />
          <Linha label="Produtos" valor={i.produtos} />
        </CardContent>
      </Card>

      <Card className="mb-3">
        <CardContent className="pt-4">
          <SectionLabel>Presença e contato</SectionLabel>
          <Linha label="Check-in" valor={i.checkinFeito ? "Sim" : "Não"} />
          <Linha
            label="Dias"
            valor={[i.d1 && "Dia 1", i.d2 && "Dia 2", i.d3 && "Dia 3"].filter(Boolean).join(", ") || "Nenhum"}
          />
          <Linha label="Ligação" valor={i.resultadoLigacao ?? (i.ligou ? "Ligou" : null)} />
          <Linha label="Confirmação" valor={i.contatoConfirmou} />
        </CardContent>
      </Card>

      {detalhes.length > 0 && (
        <Card className="mb-3">
          <CardContent className="pt-4">
            <SectionLabel>Respostas e origem</SectionLabel>
            {detalhes.map((d) => (
              <Linha key={d.label} label={d.label} valor={d.valor} />
            ))}
          </CardContent>
        </Card>
      )}
    </>
  );
}

// ── Peças ──────────────────────────────────────────────────────────────

const COR: Record<Classe, string> = {
  AA: "bg-accent text-accent-foreground",
  A: "bg-accent/80 text-accent-foreground",
  B: "bg-accent/60 text-accent-foreground",
  C: "bg-accent/45 text-accent-foreground",
  D: "bg-accent/30",
  E: "bg-accent/20",
  F: "bg-accent/12",
  X: "bg-border/60 text-muted",
};

function ClasseSelo({ classe, nota, grande }: { classe: Classe; nota: number | null; grande?: boolean }) {
  return (
    <span
      className={`flex shrink-0 flex-col items-center justify-center rounded ${COR[classe]} ${
        grande ? "h-14 w-14" : "h-9 w-9"
      }`}
    >
      <span className={`num font-semibold leading-none ${grande ? "text-lg" : "text-xs"}`}>{classe}</span>
      {nota !== null && (
        <span className={`num leading-none opacity-80 ${grande ? "mt-1 text-xs" : "mt-0.5 text-[9px]"}`}>{nota}</span>
      )}
    </span>
  );
}

function Num({ valor, rotulo }: { valor: string; rotulo: string }) {
  return (
    <div className="flex-1 text-center">
      <div className="num text-base font-semibold text-accent">{valor}</div>
      <div className="eyebrow mt-0.5">{rotulo}</div>
    </div>
  );
}

function Linha({ label, valor }: { label: string; valor: string | null }) {
  if (!valor) return null;
  return (
    <div className="flex gap-3 border-b border-border py-1.5 last:border-0">
      <span className="w-[42%] shrink-0 text-xs text-muted">{label}</span>
      <span className="flex-1 text-sm">{valor}</span>
    </div>
  );
}
