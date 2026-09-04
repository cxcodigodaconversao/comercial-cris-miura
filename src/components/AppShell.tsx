"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ChevronDown, KeyRound, LogOut, Menu, LineChart, TriangleAlert, Users } from "lucide-react";
import { supabase } from "@/lib/supabase/cliente";
import { PAPEL_LABEL, veAgregados } from "@/lib/config";
import type { Usuario } from "@/lib/types";
import { useVendas } from "@/lib/useVendas";
import { useEventos, useCorDaMarca } from "@/lib/useEventos";
import { Logo } from "./Logo";
import { Registrar } from "./Registrar";
import { Ranking } from "./Ranking";
import { MeusPontos } from "./MeusPontos";
import { Vendas } from "./Vendas";
import { MeusLinks } from "./MeusLinks";
import { Analise } from "./Analise";
import { PlanoContrato } from "./PlanoContrato";
import { SenhaModal } from "./SenhaModal";
import { Usuarios } from "./Usuarios";
import { SeletorEvento } from "./SeletorEvento";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Sheet } from "./ui/sheet";

type Aba = "registrar" | "ranking" | "pontos" | "vendas" | "links" | "usuarios" | "contrato" | "analise";

export function AppShell({ perfil }: { perfil: Usuario }) {
  const isAdmin = perfil.papel === "admin";
  const isPromotor = perfil.papel === "promotor";
  const veTudo = veAgregados(perfil.papel);

  const { eventos, evento, semEventos, selecionar } = useEventos(perfil);
  useCorDaMarca(evento);

  const { vendas, sync } = useVendas(evento.id || null);

  // O promotor abre direto em Vendas: é lá que ele trabalha o dia inteiro.
  const [aba, setAba] = useState<Aba>(veTudo ? "ranking" : isPromotor ? "vendas" : "registrar");
  const [menuAberto, setMenuAberto] = useState(false);
  const [senhaAberta, setSenhaAberta] = useState(false);
  const [seletorAberto, setSeletorAberto] = useState(false);

  // Gestão fica no menu, não na barra de abas: no celular a barra só comporta
  // o trabalho do dia (registrar, acompanhar), e admin gere de vez em quando.
  //
  // O promotor tem só Vendas e Links: ele não lança venda nem disputa placar,
  // o trabalho dele é gerar o contrato do que os outros fecharam. A política
  // `vendas_insercao` no banco recusa a inserção dele de qualquer forma —
  // aqui é só não mostrar uma porta que não abre.
  const abas = useMemo(() => {
    const lista: { id: Aba; label: string }[] = [];
    if (!isPromotor) lista.push({ id: "registrar", label: "Registrar" });
    if (veTudo) lista.push({ id: "ranking", label: "Ranking" });
    else if (!isPromotor) lista.push({ id: "pontos", label: "Pontos" });
    lista.push({ id: "vendas", label: "Vendas" });
    if (isPromotor) lista.push({ id: "contrato", label: "Contrato" });
    lista.push({ id: "links", label: "Links" });
    if (veTudo) lista.push({ id: "analise", label: "Análise" });
    return lista;
  }, [veTudo, isPromotor]);

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-[480px] flex-col">
      <header className="sticky top-0 z-20 flex items-center gap-2.5 border-b border-border bg-background px-3 py-2.5">
        <Logo size={30} />

        <button
          className="flex min-w-0 flex-1 items-center gap-1 text-left"
          onClick={() => setSeletorAberto(true)}
        >
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold leading-tight">{evento.nome}</span>
            <span className="block truncate text-[11px] leading-tight text-muted-foreground">
              {perfil.nome} · {PAPEL_LABEL[perfil.papel]}
            </span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>

        {sync === "err" && (
          <TriangleAlert
            className="h-4 w-4 shrink-0 text-destructive"
            aria-label="Falha ao sincronizar com o servidor"
          />
        )}

        <button
          aria-label="Menu"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
          onClick={() => setMenuAberto(true)}
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>

      {semEventos && (
        <div className="border-b border-warning/30 bg-warning/10 px-3 py-2 text-xs leading-relaxed text-warning">
          Nenhum evento cadastrado — não é possível registrar venda ainda.{" "}
          {isAdmin ? "Crie um evento pelo menu." : "Peça a um administrador para cadastrar."}
        </div>
      )}

      <nav className="sticky top-[57px] z-20 flex overflow-x-auto border-b border-border bg-background no-scrollbar">
        {abas.map((t) => (
          <button key={t.id} className="tab" data-active={aba === t.id} onClick={() => setAba(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      <main className="flex-1 p-3" style={{ paddingBottom: "calc(0.75rem + var(--safe-bottom))" }}>
        {aba === "registrar" && !isPromotor && <Registrar perfil={perfil} evento={evento} />}
        {aba === "ranking" && veTudo && <Ranking vendas={vendas} evento={evento} />}
        {aba === "pontos" && !veTudo && <MeusPontos vendas={vendas} perfil={perfil} />}
        {aba === "vendas" && <Vendas vendas={vendas} perfil={perfil} evento={evento} />}
        {aba === "contrato" && isPromotor && (
          <PlanoContrato perfil={perfil} evento={evento} vendas={vendas} />
        )}
        {aba === "links" && <MeusLinks perfil={perfil} evento={evento} />}
        {aba === "analise" && veTudo && <Analise evento={evento} vendas={vendas} perfil={perfil} />}
        {aba === "usuarios" && isAdmin && <Usuarios perfil={perfil} />}
      </main>

      {menuAberto && (
        <Sheet titulo="Menu" onClose={() => setMenuAberto(false)}>
          <div className="mb-4 flex items-center gap-2">
            <Badge tone="accent">{PAPEL_LABEL[perfil.papel]}</Badge>
            <span className="truncate text-sm text-muted-foreground">{perfil.email}</span>
          </div>

          <div className="flex flex-col gap-2">
            {isAdmin && (
              <Button
                variant="outline"
                full
                className="justify-start"
                onClick={() => {
                  setAba("usuarios");
                  setMenuAberto(false);
                }}
              >
                <Users className="h-4 w-4" /> Gerir usuários
              </Button>
            )}
            {isAdmin && (
              <Button
                variant="outline"
                full
                className="justify-start"
                onClick={() => {
                  setSeletorAberto(true);
                  setMenuAberto(false);
                }}
              >
                <CalendarDays className="h-4 w-4" /> Eventos
              </Button>
            )}
            {/* Fica fora deste app de propósito: é um painel próprio
                (Lead Score / check-in), aberto numa aba nova. */}
            {veTudo && evento.linkAnalise && (
              <Button
                variant="outline"
                full
                className="justify-start"
                onClick={() => {
                  window.open(evento.linkAnalise!, "_blank", "noopener,noreferrer");
                  setMenuAberto(false);
                }}
              >
                <LineChart className="h-4 w-4" /> Análise de dados
              </Button>
            )}
            <Button
              variant="outline"
              full
              className="justify-start"
              onClick={() => {
                setSenhaAberta(true);
                setMenuAberto(false);
              }}
            >
              <KeyRound className="h-4 w-4" /> Trocar minha senha
            </Button>
            <Button
              variant="danger-outline"
              full
              className="justify-start"
              onClick={() => supabase.auth.signOut()}
            >
              <LogOut className="h-4 w-4" /> Sair
            </Button>
          </div>
        </Sheet>
      )}

      {seletorAberto && (
        <SeletorEvento
          eventos={eventos}
          atual={evento}
          podeGerir={isAdmin}
          perfil={perfil}
          onSelecionar={(id) => {
            selecionar(id);
            setSeletorAberto(false);
          }}
          onClose={() => setSeletorAberto(false)}
        />
      )}

      {senhaAberta && <SenhaModal onClose={() => setSenhaAberta(false)} />}
    </div>
  );
}
