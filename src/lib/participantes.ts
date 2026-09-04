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

import type { Inscrito } from "./analise";

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
