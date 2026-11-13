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
  leadsComMaisDeUmCloser,
  type AnaliseDasAbordagens,
  type ItemDaAnalise,
} from "@/lib/analise-abordagens";
import type { Abordagem, Evento, Usuario } from "@/lib/types";
import { Button } from "./ui/button";
import { Card, CardContent, Empty, SectionLabel } from "./ui/card";
import { Input, Textarea } from "./ui/field";
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

/** O que a mentoria entrega, escrito pela equipe. Fica neste aparelho. */
const chaveDaMentoria = (eventoId: string) => `analise-abordagens:mentoria:${eventoId}`;

function lerMentoriaSalva(eventoId: string): string {
  try {
    return localStorage.getItem(chaveDaMentoria(eventoId)) ?? "";
  } catch {
    return "";
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
  // O erro fica escrito na tela: o aviso flutuante some em segundos e, no
  // salão, ninguém fica olhando para ele.
  const [erro, setErro] = useState<string | null>(null);
  const [quem, setQuem] = useState("");
  const [termo, setTermo] = useState("");
  const [mentoria, setMentoria] = useState("");
  const [mentoriaAberta, setMentoriaAberta] = useState(false);
  const podeGerar = perfil.papel !== "promotor";

  useEffect(() => {
    let vivo = true;
    setAbordagens(null);
    setAnalise(lerAnaliseSalva(evento.id));
    setErro(null);
    setQuem("");
    setMentoria(lerMentoriaSalva(evento.id));
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
    setErro(null);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Sessão expirada. Entre novamente.");
      const res = await fetch("/api/abordagens/analise", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ eventoId: evento.id, mentoria: mentoria.trim() }),
      });
      const bruto = await res.text();
      let corpo: { analise?: AnaliseDasAbordagens; error?: string; errorMessage?: string } | null = null;
      try {
        corpo = bruto ? JSON.parse(bruto) : null;
      } catch {
        // Página de erro da hospedagem: quase sempre a IA demorou além do limite.
        throw new Error(
          `A análise demorou mais que o limite do servidor (código ${res.status}). Tente de novo em instantes.`
        );
      }
      if (!res.ok || !corpo?.analise) {
        // `errorMessage` é como a hospedagem descreve função cortada por tempo ou que quebrou.
        const detalhe = corpo?.error || corpo?.errorMessage || (bruto ? bruto.slice(0, 200) : "sem resposta do servidor");
        throw new Error(corpo?.error ? detalhe : `Erro ${res.status}: ${detalhe}`);
      }
      setAnalise(corpo.analise);
      try {
        localStorage.setItem(chaveDaAnalise(evento.id), JSON.stringify(corpo.analise));
      } catch {
        // Sem armazenamento (aba anônima): a análise vale só enquanto a tela está aberta.
      }
      toast("sucesso", "Análise atualizada.");
    } catch (e) {
      const msg = (e as Error).message || "Falha de conexão.";
      setErro(msg);
      toast("erro", "Não foi possível gerar a análise.", msg);
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

  const repetidas = leadsComMaisDeUmCloser(conversas);
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

          {erro && !gerando && (
            <p className="mt-3 rounded-md bg-danger-weak px-2.5 py-2 text-sm text-destructive">
              A análise não foi gerada. Motivo: {erro}
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
              quebrar e as provas sociais para levar ao palco, sempre direcionando para a mentoria.
            </p>
          )}

          {podeGerar && (
            <div className="mt-3 rounded-md border border-border bg-background/60 p-2.5">
              <button
                type="button"
                aria-expanded={mentoriaAberta}
                onClick={() => setMentoriaAberta((v) => !v)}
                className="flex w-full items-center justify-between gap-2 text-left text-sm font-medium"
              >
                <span>Base da análise: Mentoria DSD</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {mentoriaAberta ? "Fechar" : mentoria.trim() ? "Com complemento · editar" : "Ver e complementar"}
                </span>
              </button>
              {mentoriaAberta && (
                <>
                  <p className="mt-2 text-xs text-muted-foreground">
                    O que a Mentoria DSD entrega já está fixo no app para toda a equipe (4 pilares, DIPTs, AIAs,
                    Dias de Prática, Comunidade, Hotseats, encontros presenciais, Desafios, SNIPP, garantia). A IA
                    não fala de duração, preço ou número de encontros com a Dra. Cristina, porque ainda não foram
                    confirmados.
                  </p>
                  <Textarea
                    className="mt-2"
                    value={mentoria}
                    maxLength={3000}
                    onChange={(e) => {
                      setMentoria(e.target.value);
                      try {
                        localStorage.setItem(chaveDaMentoria(evento.id), e.target.value);
                      } catch {
                        // Sem armazenamento: vale enquanto a tela estiver aberta.
                      }
                    }}
                    placeholder="Opcional. Ex.: condição especial deste evento, bônus do dia, caso de aluno que vai subir ao palco."
                    aria-label="Complemento para a análise"
                  />
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Este complemento é opcional e fica salvo só neste aparelho. Depois de escrever, toque em{" "}
                    {analise ? "Atualizar" : "Gerar análise"}.
                  </p>
                </>
              )}
            </div>
          )}

          {analise && (
            <div className="mt-4 space-y-5">
              {analise.resumo && <p className="text-sm leading-relaxed">{analise.resumo}</p>}
              {analise.mensagemCentral && (
                <div className="rounded-md border-l-4 border-accent bg-accent/10 p-3">
                  <p className="text-xs font-medium text-muted-foreground">Mensagem central para o palco</p>
                  <p className="mt-1 text-sm font-medium leading-relaxed">{analise.mensagemCentral}</p>
                </div>
              )}
              <Bloco titulo="Dificuldades reais" itens={analise.dificuldades} />
              <Bloco titulo="Objeções para quebrar no palco" itens={analise.objecoes} />
              <Bloco titulo="Provas sociais para levar ao palco" itens={analise.provasSociais} />
              <p className="text-xs text-muted-foreground">
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
          <SectionLabel>Abordagens por closer</SectionLabel>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="pb-1.5 font-medium">Quem abordou</th>
                <th className="pb-1.5 text-right font-medium">Leads</th>
                <th className="pb-1.5 text-right font-medium">Comentários</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {closers.map((c) => (
                <tr key={c.nome}>
                  <td className="py-1.5">{c.nome}</td>
                  <td className="num py-1.5 text-right">{c.leads}</td>
                  <td className="num py-1.5 text-right">{c.comentarios}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="py-1.5">Total do evento</td>
                <td className="num py-1.5 text-right">{conversas.length}</td>
                <td className="num py-1.5 text-right">{abordagens.length}</td>
              </tr>
            </tbody>
          </table>
          {repetidas > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              {repetidas} lead{repetidas === 1 ? " foi abordada" : "s foram abordadas"} por mais de um closer e
              conta{repetidas === 1 ? "" : "m"} para cada um. Por isso a soma das leads por closer passa do total.
            </p>
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
                {c.nome} · {c.leads}
              </Chip>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            O número ao lado do nome é de leads abordadas. Tocando no nome, aparecem só os comentários dessa
            pessoa.
          </p>

          <div className="mt-3 space-y-2">
            {visiveis.map((c) => (
              <div key={c.email} className="rounded-md border border-border bg-background/60 p-2.5">
                <p className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate font-medium">{c.nome}</span>
                  <span className="num shrink-0 text-xs text-muted-foreground">
                    {[c.classe, c.presente ? "presente" : null].filter(Boolean).join(" · ")}
                  </span>
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  Closer responsável: {c.closerResponsavel ?? "sem closer"}
                </p>
                <div className="mt-1.5 space-y-1.5">
                  {c.registros.map((r) => (
                    <div key={r.id} className="border-l-2 border-accent/50 pl-2">
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{r.porNome?.trim() || "(sem nome)"}</span>
                        <span className="num"> · {dataHora(r.em)}</span>
                      </p>
                      <p className="whitespace-pre-wrap text-sm">{r.observacao || "(sem texto)"}</p>
                    </div>
                  ))}
                </div>
                {quem && c.abordadaPor.length > 1 && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Também abordada por {c.abordadaPor.filter((n) => n !== quem).join(", ")}.
                  </p>
                )}
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
                <span className="num shrink-0 text-xs font-normal text-muted-foreground">
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
            {i.sozinho && (
              <p className="mt-1.5 text-sm">
                <span className="font-medium">Por que sozinho não resolve: </span>
                {i.sozinho}
              </p>
            )}
            {i.naMentoria && (
              <p className="mt-1.5 rounded bg-accent/10 px-2 py-1.5 text-sm">
                <span className="font-medium">Direcionar para a mentoria: </span>
                {i.naMentoria}
              </p>
            )}
            {i.frases.map((f) => (
              <p key={f} className="mt-1.5 border-l-2 border-accent/50 pl-2 text-sm italic">
                “{f}”
              </p>
            ))}
            {i.leads.length > 0 && (
              <p className="mt-1.5 text-xs text-muted-foreground">
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
