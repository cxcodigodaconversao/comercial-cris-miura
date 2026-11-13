// ─────────────────────────────────────────────────────────────────────────
// Atualizar a base de inscritos direto pelas PLANILHAS, sem gerar o HTML.
//
// Duas planilhas são reconhecidas pelos cabeçalhos:
//   · credenciamento — export "Participantes" do check-in (Nome completo,
//     Email, Check-in feito?, …). Atualiza presença por dia, categoria e
//     telefone, e acrescenta quem se inscreveu na porta. NÃO mexe em nota.
//   · clint — "Confirmados Clint" (Nome, E-mail, Quem confirmou, …).
//     Traz closer, faturamento, tempo de formado, especialização, CRO,
//     Instagram e acompanhante, e recalcula nota e classe da base.
//
// Diferente do HTML, planilha NÃO substitui a base: ela é mesclada por
// e-mail. Presença já registrada nunca é desmarcada.
//
// A nota é a rubrica da Cris Miura de 28/08/2026 na versão que estas
// planilhas permitem (a mesma do painel IMA Brasília): sem idade, sem
// sentimento sobre prevenção, sem "pretende participar" e sem respostas
// abertas, reescalada para o mesmo teto. Evento cuja base veio de um painel
// com a rubrica completa não deve ser repontuado por aqui — ver
// `usaRubricaCompleta`.
//
// Tudo função pura; a rota /api/inscritos/planilha só lê o arquivo e grava.
// ─────────────────────────────────────────────────────────────────────────

import { normalizarEmail, type Classe } from "./analise";

export type LinhaPlanilha = Record<string, unknown>;

/** Uma linha de `inscritos` como está no banco (sem evento_id). */
export type LinhaBase = {
  email: string;
  nome: string;
  whatsapp: string | null;
  classe: Classe;
  nota: number | null;
  perfil: number | null;
  comprometimento: number | null;
  tipo: string | null;
  ja_aluno: boolean | null;
  faturamento: string | null;
  idade: string | null;
  tempo_formado: string | null;
  area_atuacao: string | null;
  categoria_ticket: string | null;
  tem_produto: boolean;
  produtos: string | null;
  checkin_feito: boolean;
  d1: boolean;
  d2: boolean;
  d3: boolean;
  ligou: boolean;
  resultado_ligacao: string | null;
  contato_confirmou: string | null;
  extras: Record<string, unknown>;
};

export type TipoPlanilha = "credenciamento" | "clint";

export type ResumoPlanilha = {
  tipo: TipoPlanilha;
  linhas: number;
  total: number;
  novos: number;
  atualizados: number;
  ignoradas: number;
  presentes: number;
  comNota: number;
  dias: string[];
};

// ── Utilitários ─────────────────────────────────────────────────────────

const txt = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = (v instanceof Date ? dataHora(v) : String(v)).trim();
  return s || null;
};
const digitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const chaveTel = (v: unknown) => {
  const d = digitos(v);
  return d.length >= 8 ? d.slice(-8) : null;
};
const dois = (n: number) => String(n).padStart(2, "0");

/** Data do Excel → "dd/mm/aaaa hh:mm:ss" (o Excel guarda o horário "de parede" em UTC). */
function dataHora(d: Date): string {
  return `${dois(d.getUTCDate())}/${dois(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${dois(d.getUTCHours())}:${dois(d.getUTCMinutes())}:${dois(d.getUTCSeconds())}`;
}
/** "dd/mm/aaaa hh:mm:ss" → chave ordenável "aaaammdd". */
const chaveDia = (s: string | null) => (s && /^\d\d\/\d\d\/\d{4}/.test(s) ? s.slice(6, 10) + s.slice(3, 5) + s.slice(0, 2) : "");
const chaveDataHora = (s: string | null) => chaveDia(s) + (s ?? "").slice(11, 19);

function whatsappDe(v: unknown): string | null {
  const d = digitos(v);
  if (!d) return null;
  return d.length === 10 || d.length === 11 ? "55" + d : d;
}

/** "@perfil" ou "perfil" → "perfil"; e-mail, site ou texto solto → null. */
export function instagramValido(v: unknown): string | null {
  let s = String(v ?? "").replace(/\\/g, "").trim();
  if (!s || s.slice(1).includes("@") || s.includes(" ") || s.toLowerCase().includes(".com")) return null;
  if (["n", "não", "nao"].includes(s.toLowerCase())) return null;
  s = s.replace(/^@+/, "").replace(/\/+$/, "");
  return /^[A-Za-z0-9._]{2,30}$/.test(s) ? s : null;
}

export function linhaVazia(email: string, nome: string | null): LinhaBase {
  return {
    email,
    nome: nome ?? email,
    whatsapp: null,
    classe: "X",
    nota: null,
    perfil: null,
    comprometimento: null,
    tipo: null,
    ja_aluno: null,
    faturamento: null,
    idade: null,
    tempo_formado: null,
    area_atuacao: null,
    categoria_ticket: null,
    tem_produto: false,
    produtos: null,
    checkin_feito: false,
    d1: false,
    d2: false,
    d3: false,
    ligou: false,
    resultado_ligacao: null,
    contato_confirmou: null,
    extras: {},
  };
}

// ── Reconhecer a planilha ───────────────────────────────────────────────

export function detectarPlanilha(cabecalhos: string[]): TipoPlanilha | null {
  const tem = (c: string) => cabecalhos.some((h) => h.trim().toLowerCase() === c.toLowerCase());
  if (tem("Email") && tem("Check-in feito?")) return "credenciamento";
  if (tem("E-mail") && (tem("Quem confirmou") || tem("Status no formulário"))) return "clint";
  return null;
}

/** Base importada de painel com a rubrica completa (tem a pergunta de prevenção). */
export function usaRubricaCompleta(base: LinhaBase[]): boolean {
  return base.some((r) => typeof r.extras.sentimento_prevencao === "string" && r.extras.sentimento_prevencao.trim());
}

// ── Credenciamento ──────────────────────────────────────────────────────

/**
 * Os dias do evento saem da própria planilha: as datas de check-in em
 * ordem, no máximo três, até dois dias depois da primeira.
 */
export function diasDaPlanilha(linhas: LinhaPlanilha[]): string[] {
  const datas = new Set<string>();
  for (const x of linhas) {
    if (txt(x["Check-in feito?"]) !== "Sim") continue;
    const dt = txt(x["Data e hora do check-in"]);
    const up = txt(x["Atualizado em"]);
    if (chaveDia(dt)) datas.add(dt!.slice(0, 10));
    if (chaveDia(dt) && chaveDia(up) > chaveDia(dt)) datas.add(up!.slice(0, 10));
  }
  const ordenadas = [...datas].sort((a, b) => chaveDia(a).localeCompare(chaveDia(b)));
  if (!ordenadas.length) return [];
  const [d, m, a] = ordenadas[0].split("/").map(Number);
  const inicio = Date.UTC(a, m - 1, d);
  return ordenadas
    .filter((s) => {
      const [dd, mm, aa] = s.split("/").map(Number);
      return (Date.UTC(aa, mm - 1, dd) - inicio) / 86400000 <= 2;
    })
    .slice(0, 3);
}

export function aplicarCredenciamento(
  base: LinhaBase[],
  linhas: LinhaPlanilha[]
): { linhas: LinhaBase[]; resumo: ResumoPlanilha; removidos: string[] } {
  const porEmail = new Map(base.map((r) => [r.email, { ...r, extras: { ...r.extras } }]));
  // Quem entrou só pelo Clint (sem credenciamento) pode estar aqui com outro
  // e-mail: casa pelo telefone e passa a valer o e-mail do credenciamento.
  const soClintPorTel = new Map<string, LinhaBase>();
  for (const r of porEmail.values()) {
    const k = r.extras.form_match === "só no Clint" ? chaveTel(r.whatsapp) : null;
    if (k && !soClintPorTel.has(k)) soClintPorTel.set(k, r);
  }
  const removidos: string[] = [];
  const dias = diasDaPlanilha(linhas);
  const chaveDoDia = (data: string) => (["d1", "d2", "d3"] as const)[dias.indexOf(data)];

  // "Criado em" mais comum = carga dos pré-inscritos; depois disso é porta.
  const contagem = new Map<string, number>();
  for (const x of linhas) {
    const c = txt(x["Criado em"]);
    if (c) contagem.set(c, (contagem.get(c) ?? 0) + 1);
  }
  const carga = [...contagem.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  let novos = 0;
  let atualizados = 0;
  let ignoradas = 0;
  const vistos = new Set<string>();

  for (const x of linhas) {
    const email = normalizarEmail(txt(x["Email"]));
    if (!email || !email.includes("@")) {
      ignoradas++;
      continue;
    }
    let r = porEmail.get(email);
    const kTel = chaveTel(x["Telefone"]);
    const doClint = !r && kTel ? soClintPorTel.get(kTel) : undefined;
    if (doClint) {
      soClintPorTel.delete(kTel!);
      porEmail.delete(doClint.email);
      removidos.push(doClint.email);
      doClint.email = email;
      doClint.extras.form_match = "telefone";
      porEmail.set(email, doClint);
      r = doClint;
    }
    if (!r) {
      r = linhaVazia(email, txt(x["Nome completo"]));
      porEmail.set(email, r);
      novos++;
      vistos.add(email);
    } else if (!vistos.has(email)) {
      atualizados++;
      vistos.add(email);
    }
    const e = r.extras;

    const nome = txt(x["Nome completo"]);
    if (nome) r.nome = nome;
    if (txt(x["Nome do crachá"])) e.cracha = txt(x["Nome do crachá"]);
    const tel = txt(x["Telefone"]);
    if (tel) {
      r.whatsapp = whatsappDe(tel) ?? r.whatsapp;
      e.telefone = tel;
    }
    const cat = (txt(x["Categoria"]) ?? "").toUpperCase();
    if (cat) {
      e.categoria = cat === "ALUNO" ? "Aluno" : "Essencial";
      r.ja_aluno = cat === "ALUNO";
    }
    const nicho = txt(x["Nicho"]);
    if (nicho) {
      e.area_raw = nicho;
      // A especialização do Clint (area_atuacao) vale mais que o nicho.
      if (!r.area_atuacao) e.area = nicho;
    }
    if (!e.area) e.area = "Não informado";
    if (txt(x["Sexo"])) e.genero = txt(x["Sexo"]);
    if (txt(x["Faixa de idade"])) r.idade = txt(x["Faixa de idade"]);

    const criado = txt(x["Criado em"]);
    if (criado) {
      e.criado_em = `${criado.slice(0, 5)} ${criado.slice(11, 16)}`;
      if (!e.inscricao) e.inscricao = carga && chaveDataHora(criado) > chaveDataHora(carga) ? "porta" : "pre";
    }

    if (txt(x["Check-in feito?"]) === "Sim") {
      const dt = txt(x["Data e hora do check-in"]);
      const up = txt(x["Atualizado em"]);
      const eventos: string[] = [];
      if (chaveDia(dt) && chaveDoDia(dt!.slice(0, 10))) eventos.push(dt!);
      if (chaveDia(dt) && chaveDia(up) > chaveDia(dt) && chaveDoDia(up!.slice(0, 10))) eventos.push(up!);
      for (const ev of eventos) {
        const k = chaveDoDia(ev.slice(0, 10));
        if (!r[k]) {
          r[k] = true;
          e["hora_" + k] = ev.slice(11, 16);
        }
        const scan = `${ev.slice(0, 5)} ${ev.slice(11, 16)}`;
        const ordem = (s: string) => s.slice(3, 5) + s.slice(0, 2) + s.slice(6);
        if (typeof e.primeiro_scan !== "string" || ordem(scan) < ordem(e.primeiro_scan)) e.primeiro_scan = scan;
        if (typeof e.ultimo_scan !== "string" || ordem(scan) > ordem(e.ultimo_scan)) e.ultimo_scan = scan;
      }
      // Check-in sem data reconhecível ainda é presença.
      r.checkin_feito = true;
    }
  }

  const saida = [...porEmail.values()];
  // Categoria (aluno) entra na nota: se a base já tem as respostas do Clint
  // e usa esta rubrica, a nota e a classe são refeitas.
  if (!usaRubricaCompleta(saida) && saida.some((r) => r.extras.form_status)) pontuarBase(saida);
  return {
    linhas: saida,
    resumo: resumir("credenciamento", linhas.length, saida, novos, atualizados, ignoradas, dias),
    removidos,
  };
}

// ── Confirmados do Clint ────────────────────────────────────────────────

export function aplicarClint(
  base: LinhaBase[],
  linhas: LinhaPlanilha[]
): { linhas: LinhaBase[]; resumo: ResumoPlanilha } {
  const saida = base.map((r) => ({ ...r, extras: { ...r.extras } }));
  const porEmail = new Map(saida.map((r) => [r.email, r]));
  const porTel = new Map<string, LinhaBase>();
  for (const r of saida) {
    const k = chaveTel(r.whatsapp);
    if (k && !porTel.has(k)) porTel.set(k, r);
  }

  let novos = 0;
  let atualizados = 0;
  let ignoradas = 0;
  const usados = new Set<LinhaBase>();

  for (const c of linhas) {
    const email = normalizarEmail(txt(c["E-mail"]));
    const tel = txt(c["Telefone"]);
    let r = email ? porEmail.get(email) : undefined;
    let como = "e-mail";
    if (!r || usados.has(r)) {
      const k = chaveTel(tel);
      const porTelefone = k ? porTel.get(k) : undefined;
      if (porTelefone && !usados.has(porTelefone)) {
        r = porTelefone;
        como = "telefone";
      } else r = undefined;
    }
    if (!r) {
      if (!email || !email.includes("@") || porEmail.has(email)) {
        ignoradas++;
        continue;
      }
      r = linhaVazia(email, txt(c["Nome"]));
      r.extras.area = "Não informado";
      saida.push(r);
      porEmail.set(email, r);
      como = "só no Clint";
      novos++;
    } else atualizados++;
    usados.add(r);

    const e = r.extras;
    const status = txt(c["Status no formulário"]);
    const esp = txt(c["Especialização"]);
    e.form_match = como;
    e.form_status = status;
    e.compromisso = status;
    e.cro = txt(c["CRO"]);
    e.instagram_raw = txt(c["Instagram"]);
    e.instagram = instagramValido(c["Instagram"]);
    e.acompanhante = txt(c["Acompanhante"]);
    e.nome_acompanhante = txt(c["Nome acompanhante"]);
    e.quem_confirmou = txt(c["Quem confirmou"]);
    e.closer = e.quem_confirmou;
    r.tempo_formado = txt(c["Tempo de formado"]);
    r.faturamento = txt(c["Faturamento"]);
    r.area_atuacao = esp;
    if (esp) e.area = esp;
    if (status === "Concluído") r.contato_confirmou = "Confirmou";
    if (!r.whatsapp && tel) {
      r.whatsapp = whatsappDe(tel);
      e.telefone = tel;
    }
    for (const k of Object.keys(e)) if (e[k] === null) delete e[k];
  }

  pontuarBase(saida);
  return { linhas: saida, resumo: resumir("clint", linhas.length, saida, novos, atualizados, ignoradas, []) };
}

// ── Nota e classe ───────────────────────────────────────────────────────

const PTS_FATURAMENTO: Record<string, number> = {
  "Acima de R$ 40.000": 25,
  "De R$ 30.001 a R$ 40.000": 23,
  "De R$ 20.001 a R$ 30.000": 21,
  "De R$ 10.001 a R$ 20.000": 18,
  "De R$ 7.501 a R$ 10.000": 15,
  "De R$ 5.001 a R$ 7.500": 10,
  "Menos de R$ 5.000,01": 5,
  "Estou desempregado(a) no momento.": 0,
};
const PTS_TEMPO: Record<string, number> = {
  "Mais de 40 anos": 20,
  "31 a 40 anos": 20,
  "21 a 30 anos": 20,
  "11 a 20 anos": 15,
  "6 a 10 anos": 11,
  "1 a 5 anos": 7,
  Estudante: 3,
};
const PTS_AREA: Record<string, number> = { Implantodontia: 10, Periodontia: 10, "Clínico": 7 };
const MAX_PERFIL = 25 + 20 + 18 + 10;
const MAX_COMPROMETIMENTO = 40 + 15 + 10;

const temRespostas = (r: LinhaBase) => Boolean(r.faturamento || r.tempo_formado || r.area_atuacao);
const ehAlunoBase = (r: LinhaBase) => r.extras.categoria === "Aluno" || (r.extras.categoria === undefined && r.ja_aluno === true);

/** Pontua UMA linha que tem respostas. Altera a linha. */
export function pontuar(r: LinhaBase): void {
  const e = r.extras;
  const area = typeof e.area === "string" && e.area !== "Não informado" ? e.area : null;
  const perfil: [string, number | string][] = [
    ["Faturamento", PTS_FATURAMENTO[r.faturamento ?? ""] ?? 0],
    ["Tempo de formado", PTS_TEMPO[r.tempo_formado ?? ""] ?? 0],
    ["Já é aluno", ehAlunoBase(r) ? 18 : 10],
    ["Área", area ? (PTS_AREA[area] ?? 3) : 0],
  ];
  const comp: [string, number | string][] = [
    ["Cadeira (confirmou no Clint)", e.form_status === "Concluído" ? 40 : 5],
    ["Acompanhante", e.acompanhante === "Sim, vou levar" ? 15 : e.acompanhante ? 8 : 0],
    ["Contato completo", (e.instagram ? 5 : 0) + (e.cro ? 5 : 0)],
  ];
  const soma = (l: [string, number | string][]) => l.reduce((s, [, v]) => s + (typeof v === "number" ? v : 0), 0);
  const p = Math.round((soma(perfil) * 88) / MAX_PERFIL);
  const c = Math.round((soma(comp) * 100) / MAX_COMPROMETIMENTO);
  perfil.push(["(sem idade e prevenção · ×88/73)", ""]);
  comp.push(["(sem pretende participar e respostas abertas · ×100/65)", ""]);
  r.perfil = p;
  r.comprometimento = c;
  r.nota = Math.round(7 * p + 3 * c) / 10;
  r.tipo = p >= 60 ? (c >= 60 ? "completo" : "garantir presença") : c >= 60 ? "confirmado, perfil menor" : "frio nos dois";
  e.pts = { perfil, comp };
  e.form = true;
  delete e.x_motivo;
}

/**
 * Pontua e classifica a base inteira. Classe é POSIÇÃO na lista: topo 15%
 * = AA se aluno, A se não · B 15–30% · C 30–50% · D 50–70% · E 70–90% ·
 * F últimos 10%. Sem respostas = X.
 */
export function pontuarBase(base: LinhaBase[]): void {
  const comNota = base.filter(temRespostas);
  for (const r of comNota) pontuar(r);
  for (const r of base) {
    if (temRespostas(r)) continue;
    r.classe = "X";
    r.nota = r.perfil = r.comprometimento = null;
    r.tipo = null;
    r.extras.form = false;
    delete r.extras.pts;
    r.extras.x_motivo = r.extras.form_status
      ? "confirmou no Clint sem responder o perfil"
      : "não está na lista de confirmados do Clint";
  }
  comNota.sort((a, b) => b.nota! - a.nota! || b.perfil! - a.perfil! || (a.nome < b.nome ? -1 : a.nome > b.nome ? 1 : 0));
  const n = comNota.length;
  comNota.forEach((r, i) => {
    const q = i / n;
    r.classe = q < 0.15 ? (ehAlunoBase(r) ? "AA" : "A") : q < 0.3 ? "B" : q < 0.5 ? "C" : q < 0.7 ? "D" : q < 0.9 ? "E" : "F";
    r.extras.rank = i + 1;
  });
}

function resumir(
  tipo: TipoPlanilha,
  linhas: number,
  base: LinhaBase[],
  novos: number,
  atualizados: number,
  ignoradas: number,
  dias: string[]
): ResumoPlanilha {
  return {
    tipo,
    linhas,
    total: base.length,
    novos,
    atualizados,
    ignoradas,
    presentes: base.filter((r) => r.checkin_feito || r.d1 || r.d2 || r.d3).length,
    comNota: base.filter((r) => r.nota !== null).length,
    dias,
  };
}
