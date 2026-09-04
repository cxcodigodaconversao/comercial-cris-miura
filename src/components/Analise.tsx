"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { supabase } from "@/lib/supabase/cliente";
import { SELECT_INSCRITO } from "@/lib/consultas";
import { fmtVal } from "@/lib/config";
import { calcularAnalise, type Analise as Numeros, type Classe, type Contagem, type Inscrito } from "@/lib/analise";
import type { Evento, Usuario, Venda } from "@/lib/types";
import { Button } from "./ui/button";
import { Card, CardContent, Empty, SectionLabel } from "./ui/card";
import { useFeedback } from "./ui/feedback";

/**
 * Aba Análise — os KPIs do painel de conversão, dentro do app, cruzados com
 * as vendas registradas. Só admin/gestor enxergam (RLS de `inscritos`).
 *
 * Gráficos são barras em CSS de propósito: o app é usado no celular, e uma
 * biblioteca de gráficos custaria mais download do que essas listas valem.
 */
export function Analise({ evento, vendas, perfil }: { evento: Evento; vendas: Venda[]; perfil: Usuario }) {
  const { toast } = useFeedback();
  const [inscritos, setInscritos] = useState<Inscrito[] | null>(null);
  const [atualizadoEm, setAtualizadoEm] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isAdmin = perfil.papel === "admin";

  async function carregar() {
    const { data, error } = await supabase
      .from("inscritos")
      .select(SELECT_INSCRITO)
      .eq("evento_id", evento.id);
    if (error) return toast("erro", "Não foi possível carregar a análise.", error.message);
    const linhas = (data ?? []) as unknown as (Inscrito & { importadoEm?: string })[];
    setInscritos(linhas);
    setAtualizadoEm(linhas[0]?.importadoEm ?? null);
  }

  useEffect(() => {
    setInscritos(null);
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evento.id]);

  async function importar(arquivo: File) {
    setOcupado(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Sessão expirada. Entre novamente.");
      const form = new FormData();
      form.append("arquivo", arquivo);
      form.append("eventoId", evento.id);
      const res = await fetch("/api/inscritos/importar", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const corpo = await res.json();
      if (!res.ok) throw new Error(corpo.error || `Erro ${res.status}.`);
      toast("sucesso", `${corpo.importados} inscritos importados.`, corpo.descartados ? `${corpo.descartados} linha(s) sem e-mail ignorada(s).` : undefined);
      await carregar();
    } catch (e) {
      toast("erro", "Não foi possível importar.", (e as Error).message);
    } finally {
      setOcupado(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const a = useMemo(() => (inscritos ? calcularAnalise(inscritos, vendas) : null), [inscritos, vendas]);

  return (
    <>
      {inscritos === null ? (
        <Empty>Carregando…</Empty>
      ) : !a || a.total === 0 ? (
        <>
          <Empty>Nenhum inscrito importado para este evento ainda.</Empty>
          {isAdmin && <CardImportar />}
        </>
      ) : (
        <>
          {/* ── Conversão: o que só o app consegue mostrar ────────────── */}
          <Card className="mb-3 border-accent">
            <CardContent className="pt-4">
              <SectionLabel>Conversão inscritos → vendas</SectionLabel>
              <div className="mt-2 flex gap-2">
                <Kpi valor={String(a.compraram)} rotulo="Compraram" />
                <Kpi valor={`${a.conversaoGeral}%`} rotulo="Dos inscritos" />
                <Kpi valor={`${a.conversaoCheckin}%`} rotulo="Dos presentes" />
              </div>
              <div className="mt-3 flex gap-2 border-t border-border pt-3">
                <Kpi valor={fmtVal(a.volumeInscritos)} rotulo="Volume vindo da base" />
                <Kpi valor={String(a.vendasSemInscricao)} rotulo="Vendas fora da base" />
              </div>
              <p className="mt-2 text-xs text-muted">
                Junção por e-mail do cliente. "Fora da base": e-mail da venda não está entre os inscritos.
              </p>
            </CardContent>
          </Card>

          {/* ── Lead Score ───────────────────────────────────────────── */}
          <Card className="mb-3">
            <CardContent className="pt-4">
              <SectionLabel>Lead Score</SectionLabel>
              <div className="mt-2 flex gap-2">
                <Kpi valor={String(a.total)} rotulo="Inscritos" />
                <Kpi valor={String(a.comNota)} rotulo="Respondeu formulário" />
                <Kpi valor={String(a.jaAlunos)} rotulo="Já alunos" />
              </div>
              <div className="mt-3 flex gap-2 border-t border-border pt-3">
                <Kpi valor={`${a.mqlTop} · ${a.pctMqlTop}%`} rotulo="MQL top (AA+A+B)" />
                <Kpi valor={String(a.mqlAmplo)} rotulo="MQL amplo (+C)" />
              </div>
              <div className="mt-4 space-y-1.5">
                {a.porClasse.map((c) => (
                  <BarraClasse key={c.classe} classe={c.classe} n={c.n} max={a.total} vendas={c.vendas} conversao={c.conversao} />
                ))}
              </div>
              <p className="mt-2 text-xs text-muted">X = não respondeu o formulário de perfil. À direita: vendas e conversão da classe.</p>
            </CardContent>
          </Card>

          {/* ── Presença e contato ───────────────────────────────────── */}
          <Card className="mb-3">
            <CardContent className="pt-4">
              <SectionLabel>Presença</SectionLabel>
              <div className="mt-2 flex gap-2">
                <Kpi valor={`${a.checkin.feito} · ${a.checkin.pctFeito}%`} rotulo="Check-in" />
                <Kpi valor={String(a.checkin.d1)} rotulo="Dia 1" />
                <Kpi valor={String(a.checkin.d2)} rotulo="Dia 2" />
                <Kpi valor={String(a.checkin.d3)} rotulo="Dia 3" />
              </div>
              <SectionLabel className="mt-4">Funil de contato</SectionLabel>
              <div className="mt-2 flex gap-2">
                <Kpi valor={String(a.funil.ligou)} rotulo="Ligou" />
                <Kpi valor={String(a.funil.atendeu)} rotulo="Atendeu" />
                <Kpi valor={String(a.funil.confirmou)} rotulo="Confirmou" />
                <Kpi valor={String(a.funil.desconfirmou)} rotulo="Desconfirmou" />
              </div>
            </CardContent>
          </Card>

          {/* ── Perfil declarado ─────────────────────────────────────── */}
          <Bloco titulo="Faturamento mensal declarado" itens={a.faturamento} />
          <Bloco titulo="Tempo de formado(a)" itens={a.tempoFormado} />
          <Bloco titulo="Área de atuação" itens={a.area} limite={8} />
          <Bloco titulo="Faixa etária" itens={a.idade} />
          {isAdmin && <CardImportar />}
        </>
      )}
    </>
  );

  /**
   * Fica no FIM da tela de propósito: atualizar a base é tarefa ocasional do
   * admin, e quem abre a aba quer ver os números primeiro. Quando ainda não
   * há base, o card sobe para o topo — aí é a única coisa a fazer aqui.
   */
  function CardImportar() {
    return (
      <Card className="mb-3">
        <CardContent className="pt-4">
          <SectionLabel>Atualizar base de inscritos</SectionLabel>
          <p className="mt-1 text-sm text-muted">
            Suba o <span className="num">index.html</span> do painel de conversão para atualizar os dados. A
            importação substitui a base deste evento inteira — os números acima recalculam sozinhos.
          </p>
          {atualizadoEm && (
            <p className="num mt-2 text-xs text-muted">
              Última atualização: {new Date(atualizadoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
            </p>
          )}
          <input
            ref={inputRef}
            type="file"
            accept=".html,.htm,.json"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && importar(e.target.files[0])}
          />
          <Button variant="outline" full className="mt-3" disabled={ocupado} onClick={() => inputRef.current?.click()}>
            <Upload className="h-4 w-4" />
            {ocupado ? "Importando..." : inscritos?.length ? "Subir novo HTML" : "Importar painel"}
          </Button>
        </CardContent>
      </Card>
    );
  }
}

// ── Peças ──────────────────────────────────────────────────────────────

function Kpi({ valor, rotulo }: { valor: string; rotulo: string }) {
  return (
    <div className="flex-1 text-center">
      <div className="num text-base font-semibold text-accent">{valor}</div>
      <div className="eyebrow mt-0.5">{rotulo}</div>
    </div>
  );
}

const COR_CLASSE: Record<Classe, string> = {
  AA: "bg-accent", A: "bg-accent/80", B: "bg-accent/60", C: "bg-accent/45",
  D: "bg-accent/35", E: "bg-accent/25", F: "bg-accent/18", X: "bg-border",
};

function BarraClasse({ classe, n, max, vendas, conversao }: { classe: Classe; n: number; max: number; vendas: number; conversao: number }) {
  const largura = max > 0 ? Math.max(2, Math.round((n / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="num w-7 font-semibold">{classe}</span>
      <div className="h-4 flex-1 overflow-hidden rounded bg-border/40">
        <div className={`h-full rounded ${COR_CLASSE[classe]}`} style={{ width: `${largura}%` }} />
      </div>
      <span className="num w-9 text-right">{n}</span>
      <span className="num w-20 text-right text-xs text-muted">
        {vendas > 0 ? `${vendas} v · ${conversao}%` : "—"}
      </span>
    </div>
  );
}

function Bloco({ titulo, itens, limite }: { titulo: string; itens: Contagem[]; limite?: number }) {
  if (!itens.length) return null;
  const lista = limite ? itens.slice(0, limite) : itens;
  const max = Math.max(...lista.map((i) => i.n));
  const total = itens.reduce((a, i) => a + i.n, 0);
  return (
    <Card className="mb-3">
      <CardContent className="pt-4">
        <SectionLabel>{titulo}</SectionLabel>
        <div className="mt-2 space-y-1.5">
          {lista.map((i) => (
            <div key={i.label} className="flex items-center gap-2 text-sm">
              <span className="w-[46%] truncate" title={i.label}>{i.label}</span>
              <div className="h-3 flex-1 overflow-hidden rounded bg-border/40">
                <div className="h-full rounded bg-accent/60" style={{ width: `${Math.max(2, Math.round((i.n / max) * 100))}%` }} />
              </div>
              <span className="num w-14 text-right text-xs">
                {i.n} <span className="text-muted">· {Math.round((i.n / total) * 100)}%</span>
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
