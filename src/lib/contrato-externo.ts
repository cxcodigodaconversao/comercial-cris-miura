// ─────────────────────────────────────────────────────────────────────────
// Ponte entre a venda registrada aqui e o sistema de assinatura de contratos
// (app à parte: assinatura-contrato-mentoria-dex).
//
// A integração é por URL: abrimos a tela /novo de lá com os dados da venda
// na query string, e o formulário de lá lê e preenche. Nenhum banco é
// compartilhado — o que passa é só o que a pessoa já digitou aqui.
//
// O mapeamento que a venda consegue dar:
//   cliente → nome            cpf → cpf          email → email
//   telefone → telefone       valor → valor
//   cadeira (2ª cadeira) → modalidade DUPLA
//   completo (recebeu tudo) → forma VISTA; senão PRAZO
// Endereço, entrada e parcelas ficam para quem opera preencher lá.
// ─────────────────────────────────────────────────────────────────────────

import type { Venda } from "./types";

/** URL da tela de novo contrato, já com os dados da venda. */
export function urlNovoContrato(linkBase: string, v: Venda): string {
  const base = linkBase.trim().replace(/\/+$/, "");
  const q = new URLSearchParams();

  const set = (k: string, val: string | number | null | undefined) => {
    if (val === null || val === undefined) return;
    const s = String(val).trim();
    if (s) q.set(k, s);
  };

  set("nome", v.cliente);
  set("cpf", v.cpf ? v.cpf.replace(/\D/g, "") : null);
  set("email", v.email);
  set("telefone", v.telefone ? v.telefone.replace(/\D/g, "") : null);
  set("valor", v.valor > 0 ? v.valor : null);
  set("modalidade", v.cadeira ? "DUPLA" : "INDIVIDUAL");
  set("forma", v.completo ? "VISTA" : "PRAZO");
  // Rastreio: de onde veio. O sistema de lá ignora o que não conhece.
  set("origem", "app-comercial");
  set("venda_id", v.id);

  return `${base}/novo?${q.toString()}`;
}
