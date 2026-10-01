"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/cliente";
import { NOME_DO_CAMPO, vendaParaLinha, type CamposVenda } from "@/lib/consultas";
import { coordena, fmtPts } from "@/lib/config";
import { calcularPontos, type ContextoVenda } from "@/lib/pontuacao";
import type { Evento, Usuario, Venda } from "@/lib/types";
import { Button } from "./ui/button";
import { Field, Input, OptionList, SimNao, Textarea } from "./ui/field";
import { Sheet } from "./ui/sheet";
import { useFeedback } from "./ui/feedback";

export function EditModal({
  venda,
  evento,
  perfil,
  onClose,
}: {
  venda: Venda;
  evento: Evento;
  perfil: Usuario;
  onClose: () => void;
}) {
  const { toast } = useFeedback();
  const podeCoordenar = coordena(perfil.papel);
  // Só admin corrige o vendedor: transferir venda é transferir ponto no
  // ranking. O banco também trava isso (migração 0013), não só a tela.
  const podeTrocarVendedor = perfil.papel === "admin";

  const [cliente, setCliente] = useState(venda.cliente);
  const [dono, setDono] = useState({
    id: venda.usuarioId,
    nome: venda.closerNome,
    email: venda.emailCloser,
  });
  const [vendedores, setVendedores] = useState<Usuario[]>([]);

  // Lista para o seletor: só quem pode ser dono de venda, e sempre com o
  // dono atual incluído — mesmo desativado, senão o campo abre vazio e
  // parece que a venda perdeu o vendedor.
  useEffect(() => {
    if (!podeTrocarVendedor) return;
    (async () => {
      const { data } = await supabase
        .from("usuarios")
        .select("id, nome, email, papel, ativo")
        .in("papel", ["admin", "gestor", "closer"])
        .eq("ativo", true)
        .order("nome");
      const lista = (data ?? []) as Usuario[];
      setVendedores(
        lista.some((u) => u.id === venda.usuarioId)
          ? lista
          : [...lista, { id: venda.usuarioId, nome: venda.closerNome, email: venda.emailCloser } as Usuario]
      );
    })();
  }, [podeTrocarVendedor, venda.usuarioId, venda.closerNome, venda.emailCloser]);
  const [email, setEmail] = useState(venda.email ?? "");
  const [telefone, setTelefone] = useState(venda.telefone ?? "");
  const [cpf, setCpf] = useState(venda.cpf ?? "");
  const [cep, setCep] = useState(venda.cep ?? "");
  const [dataVenda, setDataVenda] = useState(venda.dataVenda ?? "");
  const [valor, setValor] = useState(String(venda.valor));
  const [recebido, setRecebido] = useState(String(venda.recebido));
  const [restante, setRestante] = useState(String(venda.restante));
  const [negociacao, setNegociacao] = useState(venda.negociacao ?? "");
  const [observacao, setObservacao] = useState(venda.observacao ?? "");
  const [faixa, setFaixa] = useState<number>(venda.faixa ?? 0);
  const [completo, setCompleto] = useState(venda.completo);
  const [cadeira, setCadeira] = useState(venda.cadeira);
  const [busy, setBusy] = useState(false);

  const contexto: ContextoVenda = useMemo(
    () => ({
      valor: parseFloat(valor) || 0,
      recebido: parseFloat(recebido) || 0,
      restante: completo ? 0 : parseFloat(restante) || 0,
      faixaIndex: faixa,
      completo,
      cadeira,
      produtoId: venda.produtoId ?? undefined,
    }),
    [valor, recebido, restante, faixa, completo, cadeira, venda.produtoId]
  );

  // Recalcula com as regras do evento — a mesma função usada no registro.
  const resultado = useMemo(
    () => calcularPontos(evento.regras, contexto),
    [evento.regras, contexto]
  );

  async function salvar() {
    const v = parseFloat(valor) || 0;
    if (!cliente.trim()) return toast("aviso", "O nome do cliente não pode ficar em branco.");

    const campos: Partial<CamposVenda> = {
      ...(podeTrocarVendedor
        ? { usuarioId: dono.id, closerNome: dono.nome, emailCloser: dono.email }
        : {}),
      cliente: cliente.trim(),
      email: email.trim() || null,
      telefone: telefone.trim() || null,
      cpf: cpf.trim() || null,
      cep: cep.trim() || null,
      dataVenda: dataVenda || null,
      valor: v,
      recebido: contexto.recebido,
      faixa,
      faixaLabel: evento.faixas[faixa]?.label ?? venda.faixaLabel,
      cadeira,
      valorCadeira: cadeira ? v * 0.5 : 0,
      completo,
      restante: contexto.restante,
      negociacao: completo ? null : negociacao.trim() || null,
      observacao: completo ? observacao.trim() || null : null,
      pts: resultado.total,
      pontosDetalhe: resultado.detalhe,
    };

    // Diferença campo a campo: é isto que responde "quem mudou o valor desta
    // venda?" quando o ranking é contestado no fim do evento.
    const alteracoes = Object.entries(campos)
      .filter(([campo, novo]) => {
        const antigo = (venda as unknown as Record<string, unknown>)[campo];
        return JSON.stringify(antigo ?? null) !== JSON.stringify(novo ?? null);
      })
      .map(([campo, novo]) => ({
        campo: NOME_DO_CAMPO[campo] ?? campo,
        de: (venda as unknown as Record<string, unknown>)[campo] ?? null,
        para: novo,
      }));

    if (!alteracoes.length) return onClose();

    setBusy(true);
    const { error } = await supabase
      .from("vendas")
      .update(vendaParaLinha(campos))
      .eq("id", venda.id);

    if (error) {
      setBusy(false);
      return toast("erro", "Não foi possível salvar.", error.message);
    }

    await supabase.from("venda_auditoria").insert({
      venda_id: venda.id,
      evento_id: venda.eventoId,
      acao: "editou",
      por_usuario: perfil.id,
      por_nome: perfil.nome,
      alteracoes,
    });

    toast("sucesso", "Venda atualizada.");
    onClose();
  }

  return (
    <Sheet
      titulo="Editar venda"
      onClose={onClose}
      rodape={
        <>
          <div className="mb-2.5 flex items-baseline justify-between">
            <span className="eyebrow">Pontuação recalculada</span>
            <span className="num text-lg font-semibold text-accent">
              {fmtPts(resultado.total)}
              {resultado.total !== venda.pts && (
                <span className="ml-1.5 text-xs font-normal text-muted-foreground line-through">
                  {fmtPts(venda.pts)}
                </span>
              )}
            </span>
          </div>
          <Button size="lg" full disabled={busy} onClick={salvar}>
            {busy ? "Salvando..." : "Salvar alterações"}
          </Button>
          {!podeCoordenar && (
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Você edita apenas as próprias vendas.
            </p>
          )}
        </>
      }
    >
      {podeTrocarVendedor && (
        <Field label="Vendedor" hint="Corrige uma venda lançada no login errado. Move os pontos no ranking.">
          <OptionList
            options={vendedores}
            selected={dono.id}
            getKey={(u) => u.id}
            getLabel={(u) => u.nome}
            onChange={(u) => setDono({ id: u.id, nome: u.nome, email: u.email })}
          />
        </Field>
      )}
      <Field label="Cliente">
        <Input value={cliente} onChange={(e) => setCliente(e.target.value)} />
      </Field>
      <Field label="E-mail do cliente">
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Telefone / WhatsApp">
        <Input type="tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
      </Field>
      <Field label="CPF / CNPJ">
        <Input inputMode="numeric" value={cpf} onChange={(e) => setCpf(e.target.value)} placeholder="000.000.000-00" />
      </Field>
      <Field label="CEP">
        <Input inputMode="numeric" value={cep} onChange={(e) => setCep(e.target.value)} placeholder="00000-000" />
      </Field>
      <Field label="Data da venda">
        <Input type="date" value={dataVenda} onChange={(e) => setDataVenda(e.target.value)} />
      </Field>
      <Field label="Valor da venda (R$)">
        <Input type="number" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
      </Field>

      <div className="my-4 h-px bg-border" />

      <Field label="Incluiu 2ª cadeira?">
        <SimNao value={cadeira} onChange={setCadeira} />
      </Field>

      <Field label="Faixa de recebimento">
        <OptionList
          options={evento.faixas}
          selected={String(faixa)}
          getKey={(_, i) => String(i)}
          getLabel={(f) => f.label}
          onChange={(_, key) => setFaixa(Number(key))}
        />
      </Field>

      <Field label="Valor recebido (R$)">
        <Input type="number" inputMode="decimal" value={recebido} onChange={(e) => setRecebido(e.target.value)} />
      </Field>

      <Field label="Recebimento completo?">
        <SimNao value={completo} onChange={setCompleto} />
      </Field>

      {!completo && (
        <div className="rounded-lg border border-border tint p-3.5">
          <Field label="Valor restante (R$)">
            <Input type="number" inputMode="decimal" value={restante} onChange={(e) => setRestante(e.target.value)} />
          </Field>
          <Field label="Como foi negociado o restante?" className="mb-0">
            <Textarea rows={3} value={negociacao} onChange={(e) => setNegociacao(e.target.value)} />
          </Field>
        </div>
      )}

      {completo && (
        <div className="rounded-lg border border-border tint p-3.5">
          <Field label="Observação (opcional)" className="mb-0">
            <Textarea rows={3} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
          </Field>
        </div>
      )}
    </Sheet>
  );
}
