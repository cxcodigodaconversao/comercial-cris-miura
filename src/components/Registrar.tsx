"use client";

import { useEffect, useMemo, useState } from "react";
import { ScanLine } from "lucide-react";
import { supabase } from "@/lib/supabase/cliente";
import { SELECT_LEAD, vendaParaLinha } from "@/lib/consultas";
import { fmtPts } from "@/lib/config";
import { calcularPontos, type ContextoVenda } from "@/lib/pontuacao";
import type { Evento, Lead, Usuario } from "@/lib/types";
import { QrScanner } from "./QrScanner";
import { Button } from "./ui/button";
import { Card, CardContent, SectionLabel } from "./ui/card";
import { Field, Input, OptionList, Select, SimNao, Textarea } from "./ui/field";
import { useFeedback } from "./ui/feedback";

export function Registrar({ perfil, evento }: { perfil: Usuario; evento: Evento }) {
  const { toast } = useFeedback();

  const [cliente, setCliente] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [cpf, setCpf] = useState("");
  const [cep, setCep] = useState("");
  const [leadId, setLeadId] = useState<string | null>(null);
  const [dataVenda, setDataVenda] = useState("");
  const [produtoId, setProdutoId] = useState(evento.produtos[0]?.id ?? "");
  const [valor, setValor] = useState("");
  const [cadeira, setCadeira] = useState<boolean | null>(null);
  const [faixa, setFaixa] = useState<number | null>(null);
  const [recebido, setRecebido] = useState("");
  const [completo, setCompleto] = useState<boolean | null>(null);
  const [restante, setRestante] = useState("");
  const [negociacao, setNegociacao] = useState("");
  const [observacao, setObservacao] = useState("");
  const [busy, setBusy] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanMsg, setScanMsg] = useState("");

  // Ao trocar de evento, o produto escolhido é de OUTRO catálogo — sem isto a
  // venda entraria com um produtoId que não existe no evento selecionado.
  useEffect(() => {
    setProdutoId(evento.produtos[0]?.id ?? "");
    setFaixa(null);
    setLeadId(null);
  }, [evento.id, evento.produtos]);

  const contexto: ContextoVenda = useMemo(
    () => ({
      valor: parseFloat(valor) || 0,
      recebido: parseFloat(recebido) || 0,
      restante: completo === false ? parseFloat(restante) || 0 : 0,
      faixaIndex: faixa,
      completo,
      cadeira,
      produtoId,
    }),
    [valor, recebido, restante, faixa, completo, cadeira, produtoId]
  );

  // Pontuação calculada pelas REGRAS DO EVENTO, ao vivo enquanto preenche.
  const resultado = useMemo(
    () => calcularPontos(evento.regras, contexto),
    [evento.regras, contexto]
  );

  async function onQrRead(bruto: string) {
    setScanOpen(false);
    const lido = (bruto || "").trim();
    // Se o QR vier como URL, vale o último trecho do caminho.
    const codigo = lido.includes("/") ? (lido.split("/").filter(Boolean).pop() ?? "") : lido;
    if (!codigo) return setScanMsg("QR vazio ou ilegível. Tente de novo.");

    setScanMsg("Buscando crachá...");
    const { data, error } = await supabase
      .from("leads")
      .select(SELECT_LEAD)
      .eq("evento_id", evento.id)
      .eq("codigo_cracha", codigo)
      .maybeSingle();

    if (error) return setScanMsg("Erro ao buscar: " + error.message);
    if (!data) return setScanMsg(`Crachá não encontrado neste evento. Lido: "${lido}"`);

    const lead = data as unknown as Lead;
    setCliente(lead.nome || "");
    setEmail(lead.email || "");
    setTelefone(lead.telefone || "");
    setCpf(lead.cpf || "");
    setCep(lead.cep || "");
    setLeadId(lead.id);
    setScanMsg(`✓ ${lead.nome}${lead.especialidade ? " · " + lead.especialidade : ""}`);
  }

  function limpar() {
    setCliente(""); setEmail(""); setTelefone(""); setCpf(""); setCep(""); setLeadId(null);
    setDataVenda(""); setValor(""); setCadeira(null); setFaixa(null);
    setRecebido(""); setCompleto(null); setRestante(""); setNegociacao("");
    setObservacao(""); setScanMsg("");
  }

  async function registrar() {
    if (!evento.id) return toast("aviso", "Cadastre um evento antes de registrar vendas.");

    const v = parseFloat(valor) || 0;
    if (!cliente.trim()) return toast("aviso", "Informe o nome do cliente.");
    if (!v) return toast("aviso", "Informe o valor da venda.");
    // A v1 exigia resposta aqui e vale manter: deixar em branco gravaria "não"
    // e o vendedor perderia meio ponto sem perceber.
    if (cadeira === null) return toast("aviso", "Informe sobre a 2ª cadeira.");
    if (faixa === null) return toast("aviso", "Selecione a faixa de recebimento.");
    if (completo === null) return toast("aviso", "Informe se o recebimento foi completo.");

    const produto = evento.produtos.find((p) => p.id === produtoId);

    const linha = vendaParaLinha({
      // Id gerado no aparelho: dois toques no botão viram upsert do MESMO
      // registro, não duas vendas.
      id: crypto.randomUUID(),
      eventoId: evento.id,
      usuarioId: perfil.id,
      closerNome: perfil.nome,
      emailCloser: perfil.email,
      cliente: cliente.trim(),
      email: email.trim() || null,
      telefone: telefone.trim() || null,
      cpf: cpf.trim() || null,
      cep: cep.trim() || null,
      leadId,
      dataVenda,
      produto: produto?.nome ?? null,
      produtoId: produtoId || null,
      valor: v,
      recebido: contexto.recebido,
      faixa,
      faixaLabel: evento.faixas[faixa]?.label ?? null,
      cadeira,
      valorCadeira: cadeira ? v * 0.5 : 0,
      completo,
      restante: contexto.restante,
      negociacao: completo === false ? negociacao.trim() || null : null,
      observacao: completo === true ? observacao.trim() || null : null,
      pts: resultado.total,
      pontosDetalhe: resultado.detalhe,
    });

    setBusy(true);
    const { error } = await supabase.from("vendas").upsert(linha, { onConflict: "id" });

    if (error) {
      setBusy(false);
      // Não limpa o formulário: o vendedor não pode perder o que digitou por
      // causa de uma falha de rede — ele toca em "Confirmar" de novo.
      toast("erro", "Não foi possível registrar. Toque em Confirmar de novo.", error.message);
      return;
    }

    // O rastro é secundário: se falhar, a venda continua válida.
    await supabase.from("venda_auditoria").insert({
      venda_id: linha.id,
      evento_id: evento.id,
      acao: "criou",
      por_usuario: perfil.id,
      por_nome: perfil.nome,
    });

    setBusy(false);
    limpar();
    toast(
      "sucesso",
      `Venda registrada · +${fmtPts(resultado.total)} ponto${resultado.total !== 1 ? "s" : ""}`,
      `${cliente.trim()} para ${perfil.nome}`
    );
  }

  return (
    <>
      <Card className="mb-3">
        <CardContent className="pt-4">
          <Button variant="outline" full size="lg" onClick={() => { setScanMsg(""); setScanOpen(true); }}>
            <ScanLine className="h-5 w-5" /> Ler crachá do lead
          </Button>
          {scanMsg && <p className="mt-2.5 text-center text-xs text-muted-foreground">{scanMsg}</p>}

          <div className="my-4 h-px bg-border" />

          <SectionLabel>Dados da venda</SectionLabel>

          {evento.produtos.length > 1 && (
            <Field label="Produto">
              <Select value={produtoId} onChange={(e) => setProdutoId(e.target.value)}>
                {evento.produtos.map((p) => (
                  <option key={p.id} value={p.id}>{p.nome}</option>
                ))}
              </Select>
            </Field>
          )}

          <Field label="Cliente">
            <Input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Nome completo" />
          </Field>
          <Field label="E-mail do cliente">
            <Input type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@exemplo.com" />
          </Field>
          <Field label="Telefone / WhatsApp">
            <Input type="tel" inputMode="tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(00) 00000-0000" />
          </Field>
          <Field label="CPF / CNPJ" hint="Vai direto para o contrato.">
            <Input inputMode="numeric" value={cpf} onChange={(e) => setCpf(e.target.value)} placeholder="000.000.000-00" />
          </Field>
          <Field label="CEP" hint="O contrato busca o endereço por ele.">
            <Input inputMode="numeric" value={cep} onChange={(e) => setCep(e.target.value)} placeholder="00000-000" />
          </Field>
          <Field label="Data da venda">
            <Input type="date" value={dataVenda} onChange={(e) => setDataVenda(e.target.value)} />
          </Field>
          <Field label="Valor da venda (R$)">
            <Input type="number" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0" />
          </Field>
        </CardContent>
      </Card>

      <Card className="mb-3">
        <CardContent className="pt-4">
          <SectionLabel>2ª cadeira</SectionLabel>
          <Field label={<>Cliente vai incluir 2ª cadeira? <span className="text-accent">(50% do valor)</span></>}>
            <SimNao value={cadeira} onChange={setCadeira} />
          </Field>
        </CardContent>
      </Card>

      <Card className="mb-3">
        <CardContent className="pt-4">
          <SectionLabel>Recebimento</SectionLabel>

          <Field label="Qual foi o recebimento?">
            <OptionList
              options={evento.faixas}
              selected={faixa === null ? null : String(faixa)}
              getKey={(_, i) => String(i)}
              getLabel={(f) => f.label}
              onChange={(_, key) => setFaixa(Number(key))}
            />
          </Field>

          <Field label="Valor recebido (R$)">
            <Input type="number" inputMode="decimal" value={recebido} onChange={(e) => setRecebido(e.target.value)} placeholder="0" />
          </Field>

          <Field label="Recebimento completo?">
            <SimNao value={completo} onChange={setCompleto} />
          </Field>

          {completo === false && (
            <div className="mt-2.5 rounded-lg border border-border tint p-3.5">
              <Field label="Valor restante (R$)">
                <Input type="number" inputMode="decimal" value={restante} onChange={(e) => setRestante(e.target.value)} placeholder="0" />
              </Field>
              <Field label="Como foi negociado o restante?" className="mb-0">
                <Textarea rows={3} value={negociacao} onChange={(e) => setNegociacao(e.target.value)} placeholder="Ex: R$ 10.000 via boleto em 30 dias..." />
              </Field>
            </div>
          )}

          {completo === true && (
            <div className="mt-2.5 rounded-lg border border-border tint p-3.5">
              <Field label={<>Observação <span className="normal-case tracking-normal">(opcional)</span></>} className="mb-0">
                <Textarea rows={3} value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Alguma anotação sobre esta venda..." />
              </Field>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Painel de pontuação — reflete as regras configuradas neste evento */}
      <Card className="mb-3">
        <CardContent className="pt-4">
          <div className="num text-[42px] font-semibold leading-none text-accent">
            {fmtPts(resultado.total)}
          </div>
          <p className="eyebrow mb-3 mt-1.5">pontos nesta venda</p>
          {resultado.detalhe.map((d) => (
            <div key={d.regraId} className="flex items-center gap-2.5 border-t border-border py-2">
              <span
                className="num flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
                style={{
                  background: d.pontos !== 0 ? "var(--accent-weak)" : "var(--muted)",
                  color: d.pontos !== 0 ? "var(--accent)" : "var(--muted-foreground)",
                }}
              >
                {d.tag}
              </span>
              <span className={d.pontos !== 0 ? "text-sm" : "text-sm text-muted-foreground"}>
                {d.label}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Button size="lg" full disabled={busy} onClick={registrar}>
        {busy ? "Registrando..." : "Confirmar venda"}
      </Button>

      {scanOpen && <QrScanner onRead={onQrRead} onClose={() => setScanOpen(false)} />}
    </>
  );
}
