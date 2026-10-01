"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, Link2, Plus, Trash2, Wand2 } from "lucide-react";
import { supabase } from "@/lib/supabase/cliente";
import { SELECT_LINK } from "@/lib/consultas";
import { fmtVal } from "@/lib/config";
import { lerOferta, removerSck, sugerirSck, trocarSck, validarSck } from "@/lib/links";
import type { Evento, LinkItem, Usuario } from "@/lib/types";
import { useUsuarios } from "@/lib/useUsuarios";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Empty } from "./ui/card";
import { Field, Input, Select } from "./ui/field";
import { Sheet } from "./ui/sheet";
import { useFeedback } from "./ui/feedback";

type Vendedor = { nome: string; sck: string | null; qtd: number };

/**
 * Gestão dos links de pagamento do evento. Só admin — quem escreve aqui
 * decide para onde vai a comissão (as políticas do banco já barram o resto).
 *
 * A ação principal é GERAR o catálogo de quem ainda não tem, copiando o de
 * um colega e trocando o token: todo vendedor recebe as mesmas ofertas, e
 * cadastrar 44 links na mão por pessoa seria convite a erro de digitação
 * num campo que ninguém confere depois.
 */
export function GerirLinks({ evento, onClose }: { evento: Evento; onClose: () => void }) {
  const { usuarios } = useUsuarios();
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [tela, setTela] = useState<"lista" | "gerar" | "avulso">("lista");
  const [vendo, setVendo] = useState<string | null>(null);

  async function recarregar() {
    setCarregando(true);
    const { data } = await supabase
      .from("links")
      .select("vendedor_nome, sck")
      .eq("evento_id", evento.id);

    const mapa = new Map<string, Vendedor>();
    for (const l of data ?? []) {
      const nome = l.vendedor_nome as string;
      const atual = mapa.get(nome) ?? { nome, sck: (l.sck as string) || null, qtd: 0 };
      atual.qtd += 1;
      mapa.set(nome, atual);
    }
    setVendedores([...mapa.values()].sort((a, b) => a.nome.localeCompare(b.nome)));
    setCarregando(false);
  }

  useEffect(() => {
    recarregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evento.id]);

  // Quem está cadastrado no sistema mas não tem link nenhum neste evento —
  // é a lista que o admin precisa resolver.
  const semLinks = useMemo(() => {
    const comLink = new Set(vendedores.map((v) => v.nome.toLowerCase()));
    return usuarios.filter((u) => u.ativo && !comLink.has(u.nome.toLowerCase()));
  }, [usuarios, vendedores]);

  if (tela === "gerar") {
    return (
      <GerarCatalogo
        evento={evento}
        vendedores={vendedores}
        candidatos={semLinks}
        onPronto={() => {
          setTela("lista");
          recarregar();
        }}
        onClose={() => setTela("lista")}
      />
    );
  }

  if (tela === "avulso") {
    return (
      <NovaOferta
        evento={evento}
        vendedores={vendedores}
        onPronto={() => {
          setTela("lista");
          recarregar();
        }}
        onClose={() => setTela("lista")}
      />
    );
  }

  if (vendo) {
    return (
      <LinksDoVendedor
        evento={evento}
        vendedor={vendo}
        onMudou={recarregar}
        onClose={() => setVendo(null)}
      />
    );
  }

  return (
    <Sheet
      titulo="Links de pagamento"
      onClose={onClose}
      rodape={
        <div className="flex gap-2">
          <Button size="lg" className="flex-1" onClick={() => setTela("gerar")}>
            <Wand2 className="h-5 w-5" /> Gerar para alguém
          </Button>
          <Button variant="outline" size="lg" className="flex-1" onClick={() => setTela("avulso")}>
            <Plus className="h-5 w-5" /> Nova oferta
          </Button>
        </div>
      }
    >
      {semLinks.length > 0 && (
        <div className="mb-4 rounded-lg border border-warning/30 bg-warning/10 p-3">
          <p className="text-sm font-medium text-warning">
            {semLinks.length} pessoa{semLinks.length > 1 ? "s" : ""} sem link neste evento
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {semLinks.map((u) => u.nome).join(", ")}. Use{" "}
            <strong>Gerar para alguém</strong> — copia o catálogo de um colega trocando só o
            token de rastreio.
          </p>
        </div>
      )}

      {carregando ? (
        <Empty>Carregando...</Empty>
      ) : !vendedores.length ? (
        <Empty>Nenhum link cadastrado neste evento ainda.</Empty>
      ) : (
        vendedores.map((v) => (
          <button
            key={v.nome}
            className="flex w-full items-center gap-2 border-b border-border py-3 text-left last:border-0"
            onClick={() => setVendo(v.nome)}
          >
            <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-medium">{v.nome}</span>
              {v.sck && <span className="num block text-xs text-muted-foreground">sck: {v.sck}</span>}
            </span>
            <Badge tone="neutral">{v.qtd}</Badge>
          </button>
        ))
      )}
    </Sheet>
  );
}

// ── Gerar catálogo a partir de outro vendedor ───────────────────────────

function GerarCatalogo({
  evento,
  vendedores,
  candidatos,
  onPronto,
  onClose,
}: {
  evento: Evento;
  vendedores: Vendedor[];
  candidatos: Usuario[];
  onPronto: () => void;
  onClose: () => void;
}) {
  const { toast } = useFeedback();
  // Modelo padrão: quem tem mais links, que é o catálogo mais completo.
  const [modelo, setModelo] = useState(
    [...vendedores].sort((a, b) => b.qtd - a.qtd)[0]?.nome ?? ""
  );
  const [destinoId, setDestinoId] = useState(candidatos[0]?.id ?? "");
  const [nomeLivre, setNomeLivre] = useState("");
  const [sck, setSck] = useState("");
  const [busy, setBusy] = useState(false);

  const destino = candidatos.find((u) => u.id === destinoId);
  const nomeFinal = destino ? destino.nome : nomeLivre.trim();

  // Sugere o token ao escolher a pessoa, mas sem sobrescrever o que o admin
  // já digitou — o token pode ter sido definido na Hotmart antes.
  useEffect(() => {
    if (destino && !sck) setSck(destino.sck || sugerirSck(destino.nome));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destinoId]);

  const qtdModelo = vendedores.find((v) => v.nome === modelo)?.qtd ?? 0;

  async function gerar() {
    const erro = validarSck(sck);
    if (erro) return toast("aviso", erro);
    if (!nomeFinal) return toast("aviso", "Escolha a pessoa ou digite um nome.");
    if (!modelo) return toast("aviso", "Escolha de quem copiar o catálogo.");

    setBusy(true);
    try {
      const { data: base, error } = await supabase
        .from("links")
        .select(SELECT_LINK)
        .eq("evento_id", evento.id)
        .eq("vendedor_nome", modelo);
      if (error) throw new Error(error.message);

      const modeloLinks = (base ?? []) as unknown as LinkItem[];
      if (!modeloLinks.length) throw new Error("O modelo escolhido não tem links.");

      const novos = modeloLinks.map((l) => ({
        evento_id: evento.id,
        vendedor_nome: nomeFinal,
        sck: sck.trim(),
        status: "new",
        oferta: l.oferta,
        valor: l.valor,
        condicao: l.condicao,
        url: trocarSck(l.url, sck.trim()),
      }));

      const { error: erroInsert } = await supabase
        .from("links")
        .upsert(novos, { onConflict: "evento_id,oferta,vendedor_nome" });
      if (erroInsert) throw new Error(erroInsert.message);

      // Sem o token no cadastro, a pessoa continua sem enxergar os links —
      // é o sck que liga uma coisa à outra.
      if (destino && destino.sck !== sck.trim()) {
        await supabase.from("usuarios").update({ sck: sck.trim() }).eq("id", destino.id);
      }

      toast(
        "sucesso",
        `${novos.length} links criados para ${nomeFinal}.`,
        destino ? "O token também foi salvo no cadastro dela." : undefined
      );
      onPronto();
    } catch (e) {
      toast("erro", "Não foi possível gerar.", (e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Sheet
      titulo="Gerar links para alguém"
      onClose={onClose}
      rodape={
        <Button size="lg" full disabled={busy} onClick={gerar}>
          {busy ? "Gerando..." : `Gerar ${qtdModelo} links`}
        </Button>
      }
    >
      <p className="text-sm leading-relaxed text-muted-foreground">
        Copia o catálogo de um vendedor que já tem links, trocando o token de rastreio. Produto,
        oferta, valor e condição continuam idênticos — muda só de quem é a comissão.
      </p>

      <div className="my-4 h-px bg-border" />

      <Field label="Copiar o catálogo de" hint={`${qtdModelo} links serão criados`}>
        <Select value={modelo} onChange={(e) => setModelo(e.target.value)}>
          {vendedores.map((v) => (
            <option key={v.nome} value={v.nome}>
              {v.nome} ({v.qtd})
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Para quem">
        <Select
          value={destinoId}
          onChange={(e) => {
            setDestinoId(e.target.value);
            setSck("");
          }}
        >
          {candidatos.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nome}
            </option>
          ))}
          <option value="">Outro (digitar o nome)</option>
        </Select>
      </Field>

      {!destinoId && (
        <Field label="Nome do vendedor" hint="Para quem não tem cadastro no app.">
          <Input
            value={nomeLivre}
            onChange={(e) => setNomeLivre(e.target.value)}
            placeholder="Nome como deve aparecer"
          />
        </Field>
      )}

      <Field
        label="Token de rastreio (sck)"
        hint="É o que identifica a venda como dessa pessoa na Hotmart. Sem espaço nem acento."
      >
        <Input
          value={sck}
          onChange={(e) => setSck(e.target.value)}
          placeholder="Ex: AnaPaula"
          autoCapitalize="off"
          autoCorrect="off"
        />
      </Field>

      {sck && !validarSck(sck) && (
        <div className="rounded-lg border border-border tint p-3">
          <p className="eyebrow mb-1.5">Como vai ficar</p>
          <p className="break-all text-[11px] text-muted-foreground">
            {trocarSck("https://pay.hotmart.com/G103456591L?off=hrbkppf0&sck=Exemplo", sck)}
          </p>
        </div>
      )}

      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        Confira o token com o responsável pela Hotmart antes de distribuir: um token errado
        registra a venda no rastreio de outra pessoa, e isso só aparece na hora da comissão.
      </p>
    </Sheet>
  );
}

// ── Nova oferta: para todos ou para um ──────────────────────────────────

function NovaOferta({
  evento,
  vendedores,
  onPronto,
  onClose,
}: {
  evento: Evento;
  vendedores: Vendedor[];
  onPronto: () => void;
  onClose: () => void;
}) {
  const { toast } = useFeedback();
  const [paraTodos, setParaTodos] = useState(true);
  const [excluidos, setExcluidos] = useState<Set<string>>(new Set());
  const [umVendedor, setUmVendedor] = useState(vendedores[0]?.nome ?? "");
  const [url, setUrl] = useState("");
  const [oferta, setOferta] = useState("");
  const [ofertaManual, setOfertaManual] = useState(false);
  const [valor, setValor] = useState("");
  const [condicao, setCondicao] = useState("");
  const [busy, setBusy] = useState(false);

  // O código da oferta está na própria URL colada. Pedir para digitar de
  // novo só criaria a chance de digitar diferente e cadastrar a mesma
  // oferta duas vezes, com metade do time em cada uma.
  useEffect(() => {
    if (ofertaManual) return;
    setOferta(lerOferta(url) ?? "");
  }, [url, ofertaManual]);

  const alvos = paraTodos
    ? vendedores.filter((v) => !excluidos.has(v.nome))
    : vendedores.filter((v) => v.nome === umVendedor);

  const exemplo =
    url && alvos.length
      ? alvos[0].sck
        ? trocarSck(url, alvos[0].sck)
        : removerSck(url)
      : "";

  async function salvar() {
    const limpa = url.trim();
    if (!limpa) return toast("aviso", "Cole a URL do link.");
    if (!/^https?:\/\//i.test(limpa)) return toast("aviso", "A URL precisa começar com https://");
    if (!oferta.trim()) {
      return toast(
        "aviso",
        "Não achei o código da oferta na URL.",
        "Preencha o campo à mão — é o que separa uma oferta da outra."
      );
    }
    if (!alvos.length) return toast("aviso", "Nenhum vendedor selecionado.");

    setBusy(true);

    // Uma linha por vendedor, cada uma com o token da pessoa trocado na URL:
    // é o `sck` que leva a comissão para quem vendeu.
    //
    // Quem não tem token (o link "de casa") fica com a URL SEM rastreio
    // nenhum — e não com a URL como veio. A URL colada quase sempre traz o
    // token de alguém, porque o admin copia do painel a partir do link de um
    // vendedor qualquer; mantê-la faria a venda da casa pagar comissão a
    // essa pessoa.
    const linhas = alvos.map((v) => ({
      evento_id: evento.id,
      vendedor_nome: v.nome,
      sck: v.sck,
      status: "new",
      oferta: oferta.trim(),
      valor: valor ? parseFloat(valor.replace(",", ".")) : null,
      condicao: condicao.trim() || null,
      url: v.sck ? trocarSck(limpa, v.sck) : removerSck(limpa),
    }));

    const { error } = await supabase
      .from("links")
      .upsert(linhas, { onConflict: "evento_id,oferta,vendedor_nome" });

    if (error) {
      setBusy(false);
      return toast("erro", "Não foi possível salvar.", error.message);
    }

    toast(
      "sucesso",
      paraTodos
        ? `Oferta criada para ${linhas.length} vendedores.`
        : `Link adicionado para ${umVendedor}.`,
      paraTodos ? "Cada um recebeu a URL com o próprio token." : undefined
    );
    onPronto();
  }

  return (
    <Sheet
      titulo="Nova oferta"
      onClose={onClose}
      rodape={
        <Button size="lg" full disabled={busy} onClick={salvar}>
          {busy
            ? "Salvando..."
            : paraTodos
              ? `Criar para ${alvos.length} vendedores`
              : "Adicionar link"}
        </Button>
      }
    >
      <p className="text-sm leading-relaxed text-muted-foreground">
        Cole a URL da oferta na Hotmart. Para cada vendedor, o app troca o token de rastreio pelo
        dela — a oferta é a mesma, a comissão vai para quem vendeu.
      </p>

      <div className="my-4 h-px bg-border" />

      <Field label="Para quem">
        <div className="flex gap-2">
          <button
            type="button"
            className="choice"
            data-state={paraTodos ? "sim" : undefined}
            onClick={() => setParaTodos(true)}
          >
            Todos
          </button>
          <button
            type="button"
            className="choice"
            data-state={!paraTodos ? "sim" : undefined}
            onClick={() => setParaTodos(false)}
          >
            Um vendedor
          </button>
        </div>
      </Field>

      {!paraTodos ? (
        <Field label="Vendedor">
          <Select value={umVendedor} onChange={(e) => setUmVendedor(e.target.value)}>
            {vendedores.map((v) => (
              <option key={v.nome} value={v.nome}>
                {v.nome}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <Field
          label={`${alvos.length} de ${vendedores.length} vão receber`}
          hint="Toque para tirar alguém da lista."
        >
          <div className="flex flex-wrap gap-1.5">
            {vendedores.map((v) => {
              const dentro = !excluidos.has(v.nome);
              return (
                <button
                  key={v.nome}
                  type="button"
                  onClick={() =>
                    setExcluidos((atual) => {
                      const novo = new Set(atual);
                      if (novo.has(v.nome)) novo.delete(v.nome);
                      else novo.add(v.nome);
                      return novo;
                    })
                  }
                  className={
                    dentro
                      ? "rounded-full border border-accent/40 tint px-2.5 py-1 text-xs text-accent"
                      : "rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground line-through opacity-60"
                  }
                >
                  {v.nome}
                </button>
              );
            })}
          </div>
        </Field>
      )}

      <Field
        label="URL da oferta"
        hint="Cole como está na Hotmart. O token de quem estiver nela será substituído."
      >
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://pay.hotmart.com/..."
          autoCapitalize="off"
          autoCorrect="off"
        />
      </Field>

      <Field
        label="Código da oferta"
        hint={
          ofertaManual
            ? "Preenchido à mão."
            : oferta
              ? "Lido da URL automaticamente."
              : "Aparece sozinho quando a URL tiver off=."
        }
      >
        <Input
          value={oferta}
          onChange={(e) => {
            setOfertaManual(true);
            setOferta(e.target.value);
          }}
          placeholder="Ex: hrbkppf0"
          autoCapitalize="off"
        />
      </Field>

      <div className="flex gap-2">
        <Field label="Valor (R$)" className="flex-1">
          <Input
            inputMode="decimal"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="0"
          />
        </Field>
        <Field label="Condição" className="flex-[2]">
          <Input
            value={condicao}
            onChange={(e) => setCondicao(e.target.value)}
            placeholder="Ex: Parcelado 12x"
          />
        </Field>
      </div>

      {exemplo && (
        <div className="rounded-lg border border-border tint p-3">
          <p className="eyebrow mb-1.5">Como fica para {alvos[0].nome}</p>
          <p className="break-all text-[11px] text-muted-foreground">{exemplo}</p>
        </div>
      )}

      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        Se a oferta já existir para alguém, o link dessa pessoa é atualizado em vez de duplicar.
      </p>
    </Sheet>
  );
}

// ── Links de um vendedor ────────────────────────────────────────────────

function LinksDoVendedor({
  evento,
  vendedor,
  onMudou,
  onClose,
}: {
  evento: Evento;
  vendedor: string;
  onMudou: () => void;
  onClose: () => void;
}) {
  const { toast, confirmar } = useFeedback();
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [carregando, setCarregando] = useState(true);

  async function buscar() {
    setCarregando(true);
    const { data } = await supabase
      .from("links")
      .select(SELECT_LINK)
      .eq("evento_id", evento.id)
      .eq("vendedor_nome", vendedor)
      .order("valor", { ascending: false, nullsFirst: false });
    setLinks((data ?? []) as unknown as LinkItem[]);
    setCarregando(false);
  }

  useEffect(() => {
    buscar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendedor, evento.id]);

  async function excluirTodos() {
    const ok = await confirmar({
      titulo: `Excluir os ${links.length} links de ${vendedor}?`,
      descricao:
        "A pessoa fica sem nenhum link neste evento. Dá para gerar de novo a partir de um colega.",
      confirmar: "Excluir todos",
      perigo: true,
    });
    if (!ok) return;

    const { error } = await supabase
      .from("links")
      .delete()
      .eq("evento_id", evento.id)
      .eq("vendedor_nome", vendedor);
    if (error) return toast("erro", "Não foi possível excluir.", error.message);
    toast("sucesso", "Links excluídos.");
    onMudou();
    onClose();
  }

  async function excluirUm(l: LinkItem) {
    const { error } = await supabase.from("links").delete().eq("id", l.id);
    if (error) return toast("erro", "Não foi possível excluir.", error.message);
    toast("sucesso", "Link excluído.");
    buscar();
    onMudou();
  }

  return (
    <Sheet
      titulo={vendedor}
      onClose={onClose}
      rodape={
        links.length ? (
          <Button variant="danger-outline" full onClick={excluirTodos}>
            <Trash2 className="h-4 w-4" /> Excluir os {links.length} links
          </Button>
        ) : undefined
      }
    >
      {carregando ? (
        <Empty>Carregando...</Empty>
      ) : !links.length ? (
        <Empty>Sem links.</Empty>
      ) : (
        links.map((l) => (
          <div key={l.id} className="border-b border-border py-3 last:border-0">
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="num text-sm font-semibold text-accent">
                {l.valor ? fmtVal(l.valor) : l.oferta}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">{l.condicao}</span>
            </div>
            <p className="mb-2 break-all text-[11px] text-muted-foreground">{l.url}</p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={async () => {
                  await navigator.clipboard.writeText(l.url);
                  toast("sucesso", "Copiado.");
                }}
              >
                <Copy className="h-3.5 w-3.5" /> Copiar
              </Button>
              <Button
                variant="danger-outline"
                size="icon-sm"
                aria-label="Excluir link"
                onClick={() => excluirUm(l)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))
      )}
    </Sheet>
  );
}
