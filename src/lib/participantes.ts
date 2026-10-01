// ─────────────────────────────────────────────────────────────────────────
// Aba Participantes — busca e apresentação de UM inscrito.
//
// Funções puras, testadas: a tela só monta o que sai daqui.
//
// Duas coisas merecem atenção:
//   · A busca ignora acento e caixa. "jose" acha "José"; sem isso o time
//     digita o nome certo e não encontra ninguém.
//   · O WhatsApp da base vem em vários formatos ("5531987818683",
//     "(31) 98781-8683"). `linkWhatsapp` normaliza para o formato do wa.me,
//     acrescentando o 55 quando falta — link errado abre conversa com
//     número inexistente, e quem opera só descobre na hora da abordagem.
// ─────────────────────────────────────────────────────────────────────────

import type { Abordagem } from "./types";
import { CLASSES, type Classe, type Inscrito } from "./analise";

/** Minúsculo e sem acento, para comparar texto digitado com texto da base. */
export function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

/**
 * Filtra por nome, e-mail, WhatsApp ou @instagram. Cada palavra do termo
 * precisa aparecer em algum campo (busca "E", não "OU"): "ana silva" não
 * traz todas as Anas nem todos os Silvas.
 */
export function filtrarParticipantes(lista: Inscrito[], termo: string): Inscrito[] {
  const palavras = semAcento(termo).split(/\s+/).filter(Boolean);
  if (!palavras.length) return lista;
  return lista.filter((i) => {
    const alvo = semAcento(
      [i.nome, i.email, i.whatsapp ?? "", String(i.extras.instagram ?? ""), digitos(i.whatsapp)].join(" ")
    );
    return palavras.every((p) => alvo.includes(p));
  });
}

const digitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");

// ── Presença e aluno ────────────────────────────────────────────────────
//
// Os dias vêm do painel (d1/d2/d3 + checkin_feito) a cada importação do
// index.html — nada aqui é digitado no app. Subiu a base nova, a lista e os
// filtros refletem na hora.

/** Presente = passou no check-in OU tem algum dia marcado (o painel às vezes
 *  marca o dia sem o flag geral; na dúvida, quem tem dia é presente). */
export function estaPresente(i: Inscrito): boolean {
  return i.checkinFeito || i.d1 || i.d2 || i.d3;
}

/** Os dias em que a pessoa esteve, como números 1..3. */
export function diasPresentes(i: Inscrito): number[] {
  return [i.d1 && 1, i.d2 && 2, i.d3 && 3].filter((d): d is number => typeof d === "number");
}

const ORDINAL = ["", "1º", "2º", "3º"];

/**
 * Selos que vão à direita do nome na lista. Um por dia presente
 * ("Presente 1º dia", …). Se fez check-in mas o painel não trouxe o dia,
 * sai um "Presente" genérico — melhor do que esconder a presença.
 */
export function rotulosPresenca(i: Inscrito): string[] {
  const dias = diasPresentes(i);
  if (dias.length) return dias.map((d) => `Presente ${ORDINAL[d]} dia`);
  return i.checkinFeito ? ["Presente"] : [];
}

export type FiltroPresenca = "todos" | "presentes";
export type FiltroAluno = "todos" | "alunos" | "nao_alunos";

/**
 * Aluno só quando respondeu "Sim"; não aluno só quando respondeu "Não".
 * Quem não respondeu (null) não entra em nenhum dos dois: na lista fica
 * sem selo, e os filtros "Alunos" / "Não alunos" não o trazem.
 */
export function ehAluno(i: Inscrito): boolean {
  return i.jaAluno === true;
}
export function ehNaoAluno(i: Inscrito): boolean {
  return i.jaAluno === false;
}

export function filtrarPresenca(lista: Inscrito[], filtro: FiltroPresenca): Inscrito[] {
  return filtro === "presentes" ? lista.filter(estaPresente) : lista;
}

export function filtrarAluno(lista: Inscrito[], filtro: FiltroAluno): Inscrito[] {
  if (filtro === "alunos") return lista.filter(ehAluno);
  if (filtro === "nao_alunos") return lista.filter(ehNaoAluno);
  return lista;
}

/**
 * Filtro por classe de Lead Score. Conjunto vazio = todas. Multi-seleção
 * de propósito: "AA + A + B" (MQL top) é o recorte mais pedido no salão.
 */
export function filtrarClasse(lista: Inscrito[], classes: ReadonlySet<Classe>): Inscrito[] {
  return classes.size ? lista.filter((i) => classes.has(i.classe)) : lista;
}

/** Quantos inscritos por classe, para o número nos chips. */
export function contarPorClasse(lista: Inscrito[]): Record<Classe, number> {
  const c = Object.fromEntries(CLASSES.map((k) => [k, 0])) as Record<Classe, number>;
  for (const i of lista) c[i.classe]++;
  return c;
}

export type ResumoPresenca = {
  presentes: number;
  alunos: number;
  naoAlunos: number;
  /** Presentes que não responderam se já são alunos. */
  semResposta: number;
  porDia: { dia: number; n: number; alunos: number; naoAlunos: number; semResposta: number }[];
};

/** Presentes totais e por dia, abertos em aluno / não aluno / sem resposta. */
export function resumoPresenca(lista: Inscrito[]): ResumoPresenca {
  const abrir = (grupo: Inscrito[]) => {
    const alunos = grupo.filter(ehAluno).length;
    const naoAlunos = grupo.filter(ehNaoAluno).length;
    return { alunos, naoAlunos, semResposta: grupo.length - alunos - naoAlunos };
  };
  const presentes = lista.filter(estaPresente);
  const porDia = [1, 2, 3].map((dia) => {
    const noDia = lista.filter((i) => diasPresentes(i).includes(dia));
    return { dia, n: noDia.length, ...abrir(noDia) };
  });
  return { presentes: presentes.length, ...abrir(presentes), porDia };
}
/** `https://wa.me/55...` ou null se o número não for utilizável. */
export function linkWhatsapp(whatsapp: string | null): string | null {
  let d = digitos(whatsapp);
  if (!d) return null;
  // Sem DDI: números brasileiros têm 10 (fixo) ou 11 (celular) dígitos.
  if (d.length === 10 || d.length === 11) d = "55" + d;
  if (d.length < 12 || d.length > 13) return null;
  return `https://wa.me/${d}`;
}

/** `https://instagram.com/perfil`, aceitando "@perfil" ou a URL inteira. */
export function linkInstagram(valor: unknown): string | null {
  const bruto = String(valor ?? "").trim();
  if (!bruto) return null;
  const usuario = bruto
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/^@/, "")
    .replace(/[/?].*$/, "")
    .trim();
  if (!usuario || !/^[A-Za-z0-9._]+$/.test(usuario)) return null;
  return `https://instagram.com/${usuario}`;
}

/** Ordenação da lista: melhor classe primeiro, depois maior nota, depois nome. */
const PESO: Record<string, number> = { AA: 0, A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, X: 7 };
export function ordenarParticipantes(lista: Inscrito[]): Inscrito[] {
  return [...lista].sort(
    (a, b) =>
      (PESO[a.classe] ?? 9) - (PESO[b.classe] ?? 9) ||
      (b.nota ?? -1) - (a.nota ?? -1) ||
      a.nome.localeCompare(b.nome, "pt-BR")
  );
}

// ── Detalhe: os campos "soltos" que vieram do painel ────────────────────

/**
 * Rótulos legíveis para o que mora em `extras`. A ordem aqui é a ordem da
 * tela. Campo que não estiver nesta lista simplesmente não é exibido —
 * assim o painel pode ganhar colunas novas sem poluir o app.
 */
export const CAMPOS_EXTRAS: { chave: string; label: string }[] = [
  { chave: "cro", label: "CRO" },
  { chave: "profissao", label: "Profissão" },
  { chave: "setor", label: "Setor" },
  { chave: "categoria", label: "Categoria" },
  { chave: "sentimento_prevencao", label: "Sentimento sobre prevenção" },
  { chave: "mais_confuso", label: "O que mais confunde" },
  { chave: "barreira", label: "Maior barreira" },
  { chave: "compromisso", label: "Compromisso declarado" },
  { chave: "acompanhante", label: "Vai levar acompanhante" },
  { chave: "comentario", label: "Comentário da equipe" },
  { chave: "primeiro_scan", label: "1º check-in" },
  { chave: "ultimo_scan", label: "Último check-in" },
  { chave: "utm_source", label: "Origem (UTM)" },
  { chave: "utm_campaign", label: "Campanha (UTM)" },
];

export type CampoDetalhe = { label: string; valor: string };

/** Os extras preenchidos, na ordem de CAMPOS_EXTRAS, já como texto. */
export function detalhesDe(i: Inscrito): CampoDetalhe[] {
  const saida: CampoDetalhe[] = [];
  for (const { chave, label } of CAMPOS_EXTRAS) {
    const v = i.extras[chave];
    if (v === null || v === undefined || v === "" || v === false) continue;
    const valor = Array.isArray(v) ? v.join(", ") : v === true ? "Sim" : String(v);
    if (valor.trim()) saida.push({ label, valor: valor.trim() });
  }
  return saida;
}

// ── Abordagens ──────────────────────────────────────────────────────────

export type PlacarAbordagem = { nome: string; pessoas: number; registros: number };

/**
 * Quantas PESSOAS distintas cada um abordou (e quantos registros fez).
 * A contagem é por pessoa, não por registro: três conversas com a mesma
 * lead são um trabalho de abordagem, não três — senão quem anota muito
 * aparece na frente de quem fala com mais gente.
 */
export function placarDeAbordagens(abordagens: Abordagem[]): PlacarAbordagem[] {
  const porPessoa = new Map<string, { emails: Set<string>; registros: number }>();
  for (const a of abordagens) {
    const nome = a.porNome?.trim() || "(sem nome)";
    const atual = porPessoa.get(nome) ?? { emails: new Set<string>(), registros: 0 };
    atual.emails.add(a.email);
    atual.registros += 1;
    porPessoa.set(nome, atual);
  }
  return [...porPessoa.entries()]
    .map(([nome, v]) => ({ nome, pessoas: v.emails.size, registros: v.registros }))
    .sort((a, b) => b.pessoas - a.pessoas || a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Agrupa por e-mail do inscrito, mais recente primeiro. */
export function abordagensPorEmail(abordagens: Abordagem[]): Map<string, Abordagem[]> {
  const m = new Map<string, Abordagem[]>();
  for (const a of [...abordagens].sort((x, y) => y.em.localeCompare(x.em))) {
    m.set(a.email, [...(m.get(a.email) ?? []), a]);
  }
  return m;
}
