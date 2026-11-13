"use client";

import { useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase/cliente";
import { SELECT_ABORDAGEM, SELECT_INSCRITO } from "@/lib/consultas";
import type { Inscrito } from "@/lib/analise";
import {
  closersQueAbordaram,
  conversasPorLead,
  filtrarConversas,
  type AnaliseDasAbordagens,
  type ItemDaAnalise,
} from "@/lib/analise-abordagens";
import type { Abordagem, Evento, Usuario } from "@/lib/types";
import { Button } from "./ui/button";
import { Card, CardContent, Empty, SectionLabel } from "./ui/card";
import { Input } from "./ui/field";
import { useFeedback } from "./ui/feedback";

const PAGINA = 1000;

/** O PostgREST corta em 1000 linhas por chamada. */
async function lerTudo<T>(tabela: "abordagens" | "inscritos", colunas: string, eventoId: string): Promise<T[]> {
  const tudo: T[] = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await supabase
      .from(tabela)
      .select(colunas)
      .eq("evento_id", eventoId)
      .order("email")
      .range(de, de + PAGINA - 1);
    if (error) throw new Error(error.message);
    tudo.push(...((data ?? []) as unknown as T[]));
    if (!data || data.length < PAGINA) return tudo;
  }
}

const chaveDaAnalise = (eventoId: string) => `analise-abordagens:${eventoId}`;

function lerAnaliseSalva(eventoId: string): AnaliseDasAbordagens | null {
  try {
    const bruto = localStorage.getItem(chaveDaAnalise(eventoId));
    return bruto ? (JSON.parse(bruto) as AnaliseDasAbordagens) : null;
  } catch {
    return null;
  }
}

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

/**
 * Aba Abordagens — o que os closers ouviram de cada lead e, em cima disso,
 * a leitura para o palco: dificuldades reais, objeções que a expert precisa
 * quebrar e provas sociais para levar.
 *
 * A análise é gerada por IA a partir dos comentários do banco, na hora em
 * que alguém pede. Fica guardada neste aparelho para não gastar cota a cada
 * visita; quem quiser a versão com as conversas novas gera de novo.
 */
export function Abordagens({ evento, perfil }: { evento: Evento; perfil: Usuario }) {
  const { toast } = useFeedback();
  const [abordagens, setAbordagens] = useState<Abordagem[] | null>(null);
  const [inscritos, setInscritos] = useState<Inscrito[]>([]);
  const [analise, setAnalise] = useState<AnaliseDasAbordagens | null>(null);
  const [gerando, setGerando] = useState(false);
  const [quem, setQuem] = useState("");
  const [termo, setTermo] = useState("");
  const podeGerar = perfil.papel !== "promotor";

  useEffect(() => {
    let vivo = true;
    setAbordagens(null);
    setAnalise(lerAnaliseSalva(evento.id));
    setQuem("");
    (async () => {
      try {
        const [abs, ins] = await Promise.all([
          lerTudo<Abordagem>("abordagens", SELECT_ABORDAGEM, evento.id),
          lerTudo<Inscrito>("inscritos", SELECT_INSCRITO, evento.id),
        ]);
        if (!vivo) return;
        setAbordagens(abs);
        setInscritos(ins);
      } catch (e) {
        if (!vivo) return;
        setAbordagens([]);
        toast("erro", "Não foi possível carregar as abordagens.", (e as Error).message);
      }
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evento.id]);

  const conversas = useMemo(() => conversasPorLead(abordagens ?? [], inscritos), [abordagens, inscritos]);
  const closers = useMemo(() => closersQueAbordaram(conversas), [conversas]);
  const visiveis = useMemo(() => filtrarConversas(conversas, quem, termo), [conversas, quem, termo]);
  const comentariosComTexto = useMemo(
    () => (abordagens ?? []).filter((a) => a.observacao?.trim()).length,
    [abordagens]
  );

  async function gerar() {
    setGerando(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Sessão expirada. Entre novamente.");
      const res = await fetch("/api/abordagens/analise", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ eventoId: evento.id }),
      });
      const bruto = await res.text();
      let corpo: { analise?: AnaliseDasAbordagens; error?: string } | null = null;
      try {
        corpo = bruto ? JSON.parse(bruto) : null;
      } catch {
        // Página de erro da hospedagem: quase sempre a IA demorou além do limite.
        throw new Error("A análise demorou mais que o limite do servidor. Tente de novo em instantes.");
      }
      if (!res.ok || !corpo?.analise) throw new Error(corpo?.error || `Erro ${res.status}.`);
      setAnalise(corpo.analise);
      try {
        localStorage.setItem(chaveDaAnalise(evento.id), JSON.stringify(corpo.analise));
      } catch {
        // Sem armazenamento (aba anônima): a análise vale só enquanto a tela está aberta.
      }
      toast("sucesso", "Análise atualizada.");
    } catch (e) {
      toast("erro", "Não foi possível gerar a análise.", (e as Error).message);
    } finally {
      setGerando(false);
    }
  }

  if (abordagens === null) return <Empty>Carregando abordagens…</Empty>;
  if (!abordagens.length) {
    return (
      <Empty>
        Nenhuma abordagem registrada neste evento ainda. Os comentários entram pela aba Participantes: abra a
        lead e escreva em &quot;Registrar abordagem&quot;.
      </Empty>
    );
  }

  const novos = analise ? comentariosComTexto - analise.comentarios : 0;

  return (
    <div>
      <Card className="mb-3">
        <CardContent className="pt-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <SectionLabel className="mb-1.5">Análise para o palco</SectionLabel>
              <p className="text-xs text-muted-foreground">
                {analise
                  ? `Gerada em ${dataHora(analise.geradaEm)} com ${analise.comentarios} comentário${
                      analise.comentarios === 1 ? "" : "s"
                    } de ${analise.leadsAnalisadas} lead${analise.leadsAnalisadas === 1 ? "" : "s"}.`
                  : `${comentariosComTexto} comentário${comentariosComTexto === 1 ? "" : "s"} de ${
                      conversas.length
                    } lead${conversas.length === 1 ? "" : "s"} prontos para analisar.`}
              </p>
            </div>
            {podeGerar && (
              <Button size="sm" onClick={gerar} disabled={gerando || !comentariosComTexto} className="shrink-0">
                <Sparkles className="mr-1.5 h-4 w-4" />
                {gerando ? "Analisando…" : analise ? "Atualizar" : "Gerar análise"}
              </Button>
            )}
          </div>

          {gerando && (
            <p className="mt-3 text-xs text-muted-foreground">
              Lendo todos os comentários. Leva até um minuto; não feche esta tela.
            </p>
          )}

          {analise && novos > 0 && !gerando && (
            <p className="mt-3 rounded-md bg-warning-weak px-2.5 py-2 text-xs text-warning">
              {novos} comentário{novos === 1 ? "" : "s"} novo{novos === 1 ? "" : "s"} desde esta análise. Toque em
              Atualizar para incluir.
            </p>
          )}

          {!analise && !gerando && (
            <p className="mt-3 text-sm text-muted-foreground">
              Toque em Gerar análise para ver as dificuldades reais das leads, as objeções que a expert precisa
              quebrar e as provas sociais para levar ao palco.
            </p>
          )}

          {analise && (
            <div className="mt-4 space-y-5">
              {analise.resumo && <p className="text-sm leading-relaxed">{analise.resumo}</p>}
              <Bloco titulo="Dificuldades reais" itens={analise.dificuldades} />
              <Bloco titulo="Objeções para quebrar no palco" itens={analise.objecoes} />
              <Bloco titulo="Provas sociais para levar ao palco" itens={analise.provasSociais} />
              <p className="text-[11px] text-muted">
                Leitura feita por IA só com os comentários registrados. As frases entre aspas foram conferidas
                e estão escritas nos comentários.
                {analise.cortadas > 0 &&
                  ` Ficaram de fora ${analise.cortadas} leads mais antigas, por limite de tamanho.`}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mb-3">
        <CardContent className="pt-4">
          <SectionLabel>Comentários por lead</SectionLabel>
          <Input
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder="Buscar por nome ou palavra do comentário"
            aria-label="Buscar nas abordagens"
          />
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <Chip ativo={!quem} onClick={() => setQuem("")}>
              Todos · {conversas.length}
            </Chip>
            {closers.map((c) => (
              <Chip key={c.nome} ativo={quem === c.nome} onClick={() => setQuem(quem === c.nome ? "" : c.nome)}>
                {c.nome} · {c.n}
              </Chip>
            ))}
          </div>

          <div className="mt-3 space-y-2">
            {visiveis.map((c) => (
              <div key={c.email} className="rounded-md border border-border bg-background/60 p-2.5">
                <p className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate font-medium">{c.nome}</span>
                  <span className="num shrink-0 text-xs text-muted">
                    {[c.classe, c.presente ? "presente" : null].filter(Boolean).join(" · ")}
                  </span>
                </p>
                <p className="truncate text-[11px] text-muted">
                  Closer responsável: {c.closerResponsavel ?? "sem closer"}
                </p>
                <div className="mt-1.5 space-y-1.5">
                  {c.registros.map((r) => (
                    <div key={r.id} className="border-l-2 border-accent/50 pl-2">
                      <p className="text-[11px] text-muted">
                        <span className="font-medium text-foreground">{r.porNome?.trim() || "(sem nome)"}</span>
                        <span className="num"> · {dataHora(r.em)}</span>
                      </p>
                      <p className="whitespace-pre-wrap text-sm">{r.observacao || "(sem texto)"}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {!visiveis.length && <Empty>Nenhuma abordagem com esse filtro.</Empty>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Chip({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
        ativo
          ? "border-foreground bg-foreground text-background"
          : "border-border-strong bg-card text-muted-foreground hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}

function Bloco({ titulo, itens }: { titulo: string; itens: ItemDaAnalise[] }) {
  if (!itens.length) return null;
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold">{titulo}</h3>
      <ol className="space-y-2.5">
        {itens.map((i, n) => (
          <li key={n} className="rounded-md border border-border bg-background/60 p-2.5">
            <p className="flex items-baseline justify-between gap-2 text-sm font-medium">
              <span>
                {n + 1}. {i.titulo}
              </span>
              {i.leads.length > 0 && (
                <span className="num shrink-0 text-xs font-normal text-muted">
                  {i.leads.length} lead{i.leads.length === 1 ? "" : "s"}
                </span>
              )}
            </p>
            {i.descricao && <p className="mt-1 text-sm text-muted-foreground">{i.descricao}</p>}
            {i.perfilDoCaso && (
              <p className="mt-1.5 text-sm">
                <span className="font-medium">Quem levar: </span>
                {i.perfilDoCaso}
              </p>
            )}
            {i.responde && (
              <p className="mt-1 text-sm">
                <span className="font-medium">O que derruba: </span>
                {i.responde}
              </p>
            )}
            {i.comoQuebrar && (
              <p className="mt-1.5 text-sm">
                <span className="font-medium">No palco: </span>
                {i.comoQuebrar}
              </p>
            )}
            {i.frases.map((f) => (
              <p key={f} className="mt-1.5 border-l-2 border-accent/50 pl-2 text-sm italic">
                “{f}”
              </p>
            ))}
            {i.leads.length > 0 && (
              <p className="mt-1.5 text-[11px] text-muted">
                {i.leads
                  .slice(0, 8)
                  .map((l) => l.nome)
                  .join(", ")}
                {i.leads.length > 8 && ` e mais ${i.leads.length - 8}`}
              </p>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
