"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, Plus, Split, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase/cliente";
import { fmtVal } from "@/lib/config";
import {
  FORMAS,
  diferenca,
  dividir,
  podeGerar,
  somaDoPlano,
  validar,
  valorDaParcela,
  type Forma,
  type Parcela,
  type Plano,
} from "@/lib/parcelamento";
import type { Evento, Usuario, Venda } from "@/lib/types";
import { Button } from "./ui/button";
import { Card, CardContent, SectionLabel } from "./ui/card";
import { Field, Input, Select } from "./ui/field";
import { useFeedback } from "./ui/feedback";

/**
 * Construtor de parcelamento — aba do promotor.
 *
 * Ele monta o plano em campos estruturados e recebe o texto formal do
 * contrato. Antes, a negociação era descrita em texto corrido e o Gemini
 * tinha que adivinhar o que era valor, data e forma.
 *
 * Dois modos, com o mesmo peso na tela: ligado a uma venda (o trabalho do
 * dia) ou avulso, para simular na hora sem criar nem alterar nada.
 */
export function PlanoContrato({
  perfil,
  evento,
  vendas,
}: {
  perfil: Usuario;
  evento: Evento;
  vendas: Venda[];
}) {
  const { toast } = useFeedback();

  const [modo, setModo] = useState<"venda" | "avulso">("venda");
  const [vendaId, setVendaId] = useState("");
  const [cliente, setCliente] = useState("");
  const [total, setTotal] = useState("");
  const [entradaValor, setEntradaValor] = useState("");
  const [entradaForma, setEntradaForma] = useState<Forma>("PIX");
  const [entradaData, setEntradaData] = useState("");
  const [parcelas, setParcelas] = useState<Parcela[]>([novaParcela()]);
  const [texto, setTexto] = useState("");
  const [gerando, setGerando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const vendaEscolhida = vendas.find((v) => v.id === vendaId);

  // A primeira venda entra como padrão para o promotor não ter que escolher
  // no caso mais comum.
  useEffect(() => {
    if (modo === "venda" && !vendaId && vendas.length) setVendaId(vendas[0].id);
  }, [modo, vendaId, vendas]);

  useEffect(() => {
    if (modo === "venda" && vendaEscolhida) {
      setTotal(String(vendaEscolhida.valor));
      setCliente(vendaEscolhida.cliente);
    }
  }, [modo, vendaEscolhida]);

  const plano: Plano = useMemo(
    () => ({
      vendaId: modo === "venda" ? vendaId : undefined,
      cliente: cliente.trim() || undefined,
      valorTotal: numero(total),
      entrada: numero(entradaValor) > 0
        ? { valor: numero(entradaValor), forma: entradaForma, data: entradaData || undefined }
        : undefined,
      parcelas,
    }),
    [modo, vendaId, cliente, total, entradaValor, entradaForma, entradaData, parcelas]
  );

  const problemas = validar(plano);
  const bloqueio = problemas.find((p) => p.bloqueia);
  const avisos = problemas.filter((p) => !p.bloqueia);
  const lancado = somaDoPlano(plano);
  const dif = diferenca(plano);
  const fecha = podeGerar(plano);
  const estado = lancado <= 0 ? "vazio" : dif === 0 ? "fecha" : dif > 0 ? "falta" : "excede";

  function trocarModo(novo: "venda" | "avulso") {
    setModo(novo);
    setTexto("");
    // Zera ao entrar no avulso: reaproveitar o valor da venda anterior faria
    // o promotor simular em cima de um número que não é daquele cliente.
    if (novo === "avulso") {
      setTotal("");
      setCliente("");
      setEntradaValor("");
      setParcelas([novaParcela()]);
    }
  }

  function alterarParcela(i: number, mudanca: Partial<Parcela>) {
    setParcelas((atual) =>
      atual.map((p, k) => {
        if (k !== i) return p;
        const nova = { ...p, ...mudanca };
        // Em dois cartões o valor é derivado, nunca digitado.
        if (nova.forma === "2 cartões de crédito") nova.valor = valorDaParcela(nova);
        return nova;
      })
    );
  }

  function dividirRestante() {
    const resto = numero(total) - numero(entradaValor);
    if (resto <= 0) return toast("aviso", "Não há valor restante para dividir.");
    const n = Number(window.prompt(`Dividir ${fmtVal(resto)} em quantas parcelas?`, "3"));
    if (!n || n < 1) return;
    setParcelas(
      dividir(resto, n).map((valor) => ({ ...novaParcela(), valor }))
    );
  }

  async function gerar() {
    setGerando(true);
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch("/api/contrato-plano", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${data.session?.access_token}`,
        },
        body: JSON.stringify(plano),
      });
      const corpo = await res.json();
      if (!res.ok) throw new Error(corpo.error || `Erro ${res.status}.`);
      setTexto(corpo.texto);
    } catch (e) {
      toast("erro", "Não foi possível gerar o texto.", (e as Error).message);
    } finally {
      setGerando(false);
    }
  }

  async function salvarNaVenda() {
    if (!vendaEscolhida) return;
    setSalvando(true);
    const { error } = await supabase
      .from("vendas")
      .update({ contrato: texto, contrato_em: new Date().toISOString() })
      .eq("id", vendaEscolhida.id);

    if (error) {
      setSalvando(false);
      return toast("erro", "Não foi possível salvar.", error.message);
    }

    await supabase.from("venda_auditoria").insert({
      venda_id: vendaEscolhida.id,
      evento_id: vendaEscolhida.eventoId,
      acao: "gerou_contrato",
      por_usuario: perfil.id,
      por_nome: perfil.nome,
    });

    setSalvando(false);
    toast("sucesso", "Texto salvo na venda.", vendaEscolhida.cliente);
  }

  return (
    <>
      {/* ── Modo ─────────────────────────────────────────────── */}
      <Card className="mb-3">
        <CardContent className="pt-4">
          <SectionLabel>Para que é este plano</SectionLabel>
          <div className="flex gap-2">
            <button
              type="button"
              className="choice"
              data-state={modo === "venda" ? "sim" : undefined}
              onClick={() => trocarModo("venda")}
            >
              De uma venda
            </button>
            <button
              type="button"
              className="choice"
              data-state={modo === "avulso" ? "sim" : undefined}
              onClick={() => trocarModo("avulso")}
            >
              Avulso
            </button>
          </div>

          {modo === "venda" ? (
            <Field
              className="mt-3 mb-0"
              hint={
                vendas.length
                  ? "O texto pode ser salvo direto nessa venda."
                  : undefined
              }
            >
              {vendas.length ? (
                <Select value={vendaId} onChange={(e) => setVendaId(e.target.value)}>
                  {vendas.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.cliente} — {fmtVal(v.valor)} · {v.closerNome}
                    </option>
                  ))}
                </Select>
              ) : (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Nenhuma venda registrada neste evento ainda. Use{" "}
                  <strong className="text-foreground">Avulso</strong> para montar um plano agora.
                </p>
              )}
            </Field>
          ) : (
            <Field
              className="mt-3 mb-0"
              hint="Não cria venda nem altera nada. Serve para simular na hora, com o cliente na frente."
            >
              <Input
                value={cliente}
                onChange={(e) => setCliente(e.target.value)}
                placeholder="Para quem é (opcional)"
              />
            </Field>
          )}
        </CardContent>
      </Card>

      {/* ── Valor total ──────────────────────────────────────── */}
      <Card className="mb-3">
        <CardContent className="pt-4">
          <Field
            label={modo === "venda" ? "Valor total da venda" : "Valor total"}
            className="mb-0"
          >
            <Input
              inputMode="decimal"
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              placeholder="0,00"
              readOnly={modo === "venda"}
              className={modo === "venda" ? "bg-muted text-muted-foreground" : undefined}
            />
          </Field>
        </CardContent>
      </Card>

      {/* ── Entrada ──────────────────────────────────────────── */}
      <Card className="mb-3">
        <CardContent className="pt-4">
          <SectionLabel>Entrada (opcional)</SectionLabel>
          <div className="flex gap-2">
            <Input
              inputMode="decimal"
              className="flex-1"
              value={entradaValor}
              onChange={(e) => setEntradaValor(e.target.value)}
              placeholder="0,00"
            />
            <Select
              className="flex-[1.2]"
              value={entradaForma}
              onChange={(e) => setEntradaForma(e.target.value as Forma)}
            >
              {FORMAS.filter((f) => f !== "2 cartões de crédito").map((f) => (
                <option key={f}>{f}</option>
              ))}
            </Select>
          </div>
          <Field className="mt-2 mb-0">
            <Input type="date" value={entradaData} onChange={(e) => setEntradaData(e.target.value)} />
          </Field>
        </CardContent>
      </Card>

      {/* ── Parcelas ─────────────────────────────────────────── */}
      <Card className="mb-3">
        <CardContent className="pt-4">
          <SectionLabel>Parcelas</SectionLabel>

          {parcelas.map((p, i) => (
            <div key={i} className="mb-2 rounded-lg border border-border bg-background p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="eyebrow">Parcela {i + 1}</span>
                {parcelas.length > 1 && (
                  <button
                    className="text-xs text-destructive"
                    onClick={() => setParcelas((a) => a.filter((_, k) => k !== i))}
                  >
                    <Trash2 className="inline h-3.5 w-3.5" /> remover
                  </button>
                )}
              </div>

              <div className="flex gap-2">
                <Input
                  inputMode="decimal"
                  className={
                    p.forma === "2 cartões de crédito"
                      ? "flex-1 bg-muted text-muted-foreground"
                      : "flex-1"
                  }
                  value={p.forma === "2 cartões de crédito" ? formatarNum(p.valor) : campoNum(p.valor)}
                  readOnly={p.forma === "2 cartões de crédito"}
                  title={p.forma === "2 cartões de crédito" ? "Somado dos dois cartões" : undefined}
                  onChange={(e) => alterarParcela(i, { valor: numero(e.target.value) })}
                  placeholder="0,00"
                />
                <Select
                  className="flex-[1.2]"
                  value={p.forma}
                  onChange={(e) => alterarParcela(i, { forma: e.target.value as Forma })}
                >
                  {FORMAS.map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </Select>
              </div>

              {p.forma === "Cartão de crédito" && (
                <Field className="mt-2 mb-0">
                  <Input
                    inputMode="numeric"
                    value={p.vezes ?? ""}
                    onChange={(e) => alterarParcela(i, { vezes: Number(e.target.value) || undefined })}
                    placeholder="Em quantas vezes? Ex: 12"
                  />
                </Field>
              )}

              {p.forma === "2 cartões de crédito" && (
                <>
                  {([1, 2] as const).map((n) => {
                    const chave = n === 1 ? "cartao1" : "cartao2";
                    const c = p[chave];
                    return (
                      <div key={n} className="mt-2">
                        <span className="eyebrow">{n}º cartão</span>
                        <div className="mt-1 flex gap-2">
                          <Input
                            inputMode="decimal"
                            className="flex-[1.3]"
                            value={campoNum(c?.valor)}
                            onChange={(e) =>
                              alterarParcela(i, {
                                [chave]: { ...c, valor: numero(e.target.value) },
                              } as Partial<Parcela>)
                            }
                            placeholder="0,00"
                          />
                          <Input
                            inputMode="numeric"
                            className="flex-1"
                            value={c?.vezes ?? ""}
                            onChange={(e) =>
                              alterarParcela(i, {
                                [chave]: { valor: c?.valor ?? 0, vezes: Number(e.target.value) || undefined },
                              } as Partial<Parcela>)
                            }
                            placeholder="12x"
                          />
                        </div>
                      </div>
                    );
                  })}
                </>
              )}

              <div className="mt-2 flex gap-2">
                <Select
                  className="flex-1"
                  value={p.quando}
                  onChange={(e) => alterarParcela(i, { quando: e.target.value as "data" | "dias" })}
                >
                  <option value="data">Em uma data</option>
                  <option value="dias">Dias após assinar</option>
                </Select>
                {p.quando === "data" ? (
                  <Input
                    type="date"
                    className="flex-[1.2]"
                    value={p.data ?? ""}
                    onChange={(e) => alterarParcela(i, { data: e.target.value })}
                  />
                ) : (
                  <Input
                    inputMode="numeric"
                    className="flex-[1.2]"
                    value={p.dias ?? ""}
                    onChange={(e) => alterarParcela(i, { dias: Number(e.target.value) || undefined })}
                    placeholder="30"
                  />
                )}
              </div>
            </div>
          ))}

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => setParcelas((a) => [...a, novaParcela()])}
            >
              <Plus className="h-3.5 w-3.5" /> Parcela
            </Button>
            <Button variant="outline" size="sm" className="flex-1" onClick={dividirRestante}>
              <Split className="h-3.5 w-3.5" /> Dividir o restante
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Conferência ──────────────────────────────────────── */}
      <div
        className="mb-3 rounded-xl border p-4"
        style={{
          background:
            estado === "fecha"
              ? "rgba(46,106,69,.1)"
              : estado === "excede"
                ? "rgba(158,59,48,.08)"
                : "rgba(142,100,24,.12)",
          borderColor:
            estado === "fecha"
              ? "rgba(46,106,69,.3)"
              : estado === "excede"
                ? "rgba(158,59,48,.35)"
                : "rgba(142,100,24,.35)",
        }}
      >
        <div className="flex justify-between text-sm">
          <span>Valor total</span>
          <span className="num font-medium">{fmtVal(numero(total))}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span>Lançado no plano</span>
          <span className="num font-medium">{fmtVal(lancado)}</span>
        </div>
        <p
          className="mt-2.5 border-t border-border pt-2.5 text-sm leading-snug"
          style={{
            color:
              estado === "fecha"
                ? "var(--success)"
                : estado === "excede"
                  ? "var(--destructive)"
                  : "var(--warning)",
            fontWeight: estado === "fecha" ? 600 : 400,
          }}
        >
          {bloqueio?.mensagem ?? "Plano fechado. Pode gerar o texto."}
        </p>
        {avisos.map((a) => (
          <p key={a.campo} className="mt-1.5 text-xs text-muted-foreground">
            {a.mensagem}
          </p>
        ))}
      </div>

      <Button size="lg" full disabled={!fecha || gerando} onClick={gerar}>
        {gerando ? "Gerando..." : "Gerar texto do contrato"}
      </Button>

      {/* ── Resultado ────────────────────────────────────────── */}
      {texto && (
        <Card className="mt-3">
          <CardContent className="pt-4">
            <SectionLabel>Texto para o contrato</SectionLabel>
            <textarea
              className="inp min-h-[140px] leading-relaxed"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              spellCheck={false}
            />
            <div className="mt-2 flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={async () => {
                  await navigator.clipboard.writeText(texto);
                  toast("sucesso", "Copiado.");
                }}
              >
                <Copy className="h-4 w-4" /> Copiar
              </Button>
              {modo === "venda" && vendaEscolhida && (
                <Button className="flex-[1.3]" disabled={salvando} onClick={salvarNaVenda}>
                  {salvando ? "Salvando..." : "Salvar na venda"}
                </Button>
              )}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Dá para editar antes de copiar — o Gemini erra nome próprio de vez em quando.
            </p>
          </CardContent>
        </Card>
      )}
    </>
  );
}

// ── Auxiliares ──────────────────────────────────────────────────────────

function novaParcela(): Parcela {
  return { valor: 0, forma: "PIX", quando: "data", data: "" };
}

/** Aceita "10.000,00" e "10000.00": o promotor digita do jeito dele. */
function numero(txt: string | number | undefined): number {
  if (typeof txt === "number") return txt;
  if (!txt) return 0;
  let limpo = String(txt).trim().replace(/\s/g, "");
  if (limpo.includes(",")) limpo = limpo.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(limpo);
  return Number.isFinite(n) ? n : 0;
}

/** Campo editável: 0 aparece vazio, para o promotor não ter que apagar. */
const campoNum = (n: number | undefined) => (n ? String(n) : "");

const formatarNum = (n: number) =>
  n ? n.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "";
