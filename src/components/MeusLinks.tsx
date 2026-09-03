"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Settings2 } from "lucide-react";
import { supabase } from "@/lib/supabase/cliente";
import { SELECT_LINK } from "@/lib/consultas";
import { fmtVal, leTodasAsVendas } from "@/lib/config";
import type { Evento, LinkItem, Usuario } from "@/lib/types";
import { GerirLinks } from "./GerirLinks";
import { Button } from "./ui/button";
import { Card, CardContent, Empty } from "./ui/card";
import { Field, Input, Select } from "./ui/field";
import { useFeedback } from "./ui/feedback";

export function MeusLinks({ perfil, evento }: { perfil: Usuario; evento: Evento }) {
  const { toast } = useFeedback();
  // Quem enxerga o evento inteiro escolhe de quem quer ver os links. O
  // closer vê só os dele — o `sck` do link é o que rastreia a comissão.
  const veTudo = leTodasAsVendas(perfil.papel);

  const [vendedor, setVendedor] = useState(perfil.nome);
  const [vendedores, setVendedores] = useState<string[]>([]);
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [gerindo, setGerindo] = useState(false);
  // Contador só para forçar nova busca depois que o admin mexe nos links —
  // reatribuir o mesmo vendedor não dispararia o efeito.
  const [versao, setVersao] = useState(0);
  const isAdmin = perfil.papel === "admin";

  // A lista de vendedores vem dos PRÓPRIOS links, não da tabela de usuários:
  // a base traz nomes que nunca existiram como acesso do app (Zuca,
  // Valadares, "Sem nome (casa)"), e filtrar por usuário esconderia esses links.
  useEffect(() => {
    if (!veTudo || !evento.id) return;
    supabase
      .from("links")
      .select("vendedor_nome")
      .eq("evento_id", evento.id)
      .then(({ data }) => {
        const nomes = [...new Set((data ?? []).map((l) => l.vendedor_nome as string))].sort();
        setVendedores(nomes);
        // Se o próprio nome não tem links neste evento, mostra o primeiro que tem.
        if (nomes.length && !nomes.includes(perfil.nome)) setVendedor(nomes[0]);
      });
  }, [veTudo, evento.id, perfil.nome]);

  useEffect(() => {
    if (!evento.id) {
      setLinks([]);
      setCarregando(false);
      return;
    }
    setCarregando(true);

    const consulta = supabase
      .from("links")
      .select(SELECT_LINK)
      .eq("evento_id", evento.id)
      .order("valor", { ascending: false, nullsFirst: false });

    // Para o próprio vendedor, casa pelo `sck` — que é o token de rastreio
    // da Hotmart e a única chave estável entre pessoa e link. Casar por nome
    // falharia sempre que o cadastro tiver o nome completo ("Rodrigo
    // Zucaratto") e o link o apelido ("Rodrigo"), que é o caso da base real.
    // `ilike` sem curinga = igualdade sem diferenciar maiúscula.
    const filtrada =
      !veTudo && perfil.sck
        ? consulta.ilike("sck", perfil.sck)
        : consulta.eq("vendedor_nome", vendedor);

    filtrada.then(({ data, error }) => {
      setLinks(error ? [] : ((data ?? []) as unknown as LinkItem[]));
      setCarregando(false);
    });
  }, [vendedor, evento.id, veTudo, perfil.sck, versao]);

  const filtrados = useMemo(() => {
    const termo = busca.trim();
    if (!termo) return links;
    const numeros = termo.replace(/\D/g, "");
    return links.filter(
      (l) =>
        (numeros && String(l.valor ?? "").includes(numeros)) ||
        (l.condicao ?? "").toLowerCase().includes(termo.toLowerCase())
    );
  }, [links, busca]);

  async function copiar(url: string) {
    await navigator.clipboard.writeText(url);
    toast("sucesso", "Link copiado.");
  }

  return (
    <>
      <Card className="mb-3">
        <CardContent className="pt-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="eyebrow">Links de pagamento · Hotmart</p>
            {isAdmin && (
              <Button variant="outline" size="sm" onClick={() => setGerindo(true)}>
                <Settings2 className="h-3.5 w-3.5" /> Gerir
              </Button>
            )}
          </div>

          {veTudo && vendedores.length > 0 && (
            <Field label="Vendedor">
              <Select value={vendedor} onChange={(e) => setVendedor(e.target.value)}>
                {vendedores.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <Field label="Buscar por valor ou condição" className="mb-0">
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Ex: 29997, parcelado..."
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          {carregando ? (
            <Empty>Carregando links...</Empty>
          ) : !filtrados.length ? (
            <Empty>
              {veTudo ? (
                <>
                  Nenhum link para {vendedor} neste evento.
                  <br />
                  <span className="text-xs">Os links são cadastrados por evento.</span>
                </>
              ) : perfil.sck ? (
                <>
                  Você ainda não tem links neste evento.
                  <br />
                  <span className="text-xs">Peça a um administrador para cadastrar.</span>
                </>
              ) : (
                <>
                  Seu cadastro não tem token de rastreio.
                  <br />
                  <span className="text-xs">
                    Sem ele o sistema não sabe quais links são seus — peça a um administrador
                    para preencher o campo <strong>sck</strong> no seu cadastro.
                  </span>
                </>
              )}
            </Empty>
          ) : (
            filtrados.map((l) => (
              <div key={l.id} className="border-b border-border py-3 last:border-0">
                <div className="mb-1.5 flex items-baseline justify-between gap-2">
                  <span className="num text-base font-semibold text-accent">
                    {l.valor ? fmtVal(l.valor) : l.condicao || l.oferta}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{l.condicao}</span>
                </div>
                <p className="mb-2 break-all text-[11px] text-muted-foreground">{l.url}</p>
                <div className="flex gap-2">
                  <Button variant="accent" size="sm" className="flex-1" onClick={() => copiar(l.url)}>
                    Copiar link
                  </Button>
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border-strong bg-card px-3.5 text-sm font-medium"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Abrir
                  </a>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {gerindo && (
        <GerirLinks
          evento={evento}
          onClose={() => {
            setGerindo(false);
            // Recarrega: o admin pode ter acabado de gerar o catálogo de
            // alguém, e a lista aberta atrás ficaria desatualizada.
            setVersao((v) => v + 1);
          }}
        />
      )}
    </>
  );
}
