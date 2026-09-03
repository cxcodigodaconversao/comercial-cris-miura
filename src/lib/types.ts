// ─────────────────────────────────────────────────────────────────────────
// Modelo de dados. O que na v1 estava em constantes de código (EMAIL_MAP,
// CLOSERS, FAIXA_LABELS, getPts) aqui é DADO, nas tabelas `usuarios` e
// `eventos`. Espelha supabase/migrations/0001_esquema_inicial.sql.
//
// Convenção: o banco é snake_case, o app é camelCase. A tradução acontece
// num lugar só — nos `select` com apelido em lib/consultas.ts.
// ─────────────────────────────────────────────────────────────────────────

// ── Usuários ────────────────────────────────────────────────────────────

/**
 * `gestor` é o papel que faltava na v1 (que só tinha adm sim/não): o
 * coordenador vê o evento inteiro sem mexer no time nem nas regras.
 *
 * `promotor` é o operador de contratos: enxerga a venda de todo mundo para
 * gerar o texto do plano de pagamento, mas fica fora da disputa comercial —
 * sem ranking, sem totais e sem meta. No banco, um trigger garante que ele
 * só escreva o campo do contrato em venda que não é dele.
 */
export type Papel = "admin" | "gestor" | "closer" | "promotor";

export type Usuario = {
  id: string;
  email: string;
  nome: string;
  papel: Papel;
  ativo: boolean;
  sck: string | null;
  telefone: string | null;
  /** Trava o app na tela de troca até a pessoa criar uma senha própria. */
  precisaTrocarSenha: boolean;
  criadoEm: string;
  criadoPor: string | null;
  desativadoEm: string | null;
};

// ── Eventos ─────────────────────────────────────────────────────────────

export type StatusEvento = "rascunho" | "ativo" | "encerrado" | "arquivado";
export type Marca = "IMA_BH" | "MENTORIA" | "CONGRESSO";
export type CriterioDesempate = "recebido" | "valor" | "vendas" | "primeiro_a_atingir";

export type Produto = { id: string; nome: string; valorPadrao?: number };

/** Faixa de recebimento. `max` ausente = faixa aberta no topo. */
export type Faixa = { label: string; min: number; max?: number };

export type OperadorRegra = ">=" | "<=" | "==" | "!=" | ">" | "<" | "é";

export type CondicaoRegra = {
  /** valor, recebido, restante, faixaIndex, completo, cadeira, produtoId */
  campo: string;
  op: OperadorRegra;
  valor: number | string | boolean;
};

/**
 * Regra de pontuação declarativa, avaliada por lib/pontuacao.ts — regra
 * vinda do banco nunca vira código executável.
 */
export type Regra = {
  id: string;
  label: string;
  tag: string;
  pontos: number;
  tipo: "base" | "condicao" | "porFaixa" | "proporcional";
  condicoes?: CondicaoRegra[];
  pontosPorFaixa?: number[];
  campoBase?: string;
  divisor?: number;
  teto?: number;
  ativo: boolean;
};

export type MetricaMeta = "faturamento" | "recebido" | "vendas" | "pontos";

export type Meta = {
  id: string;
  escopo: "evento" | "vendedor" | "dia";
  metrica: MetricaMeta;
  valor: number;
  alvoUsuarioId?: string;
  alvoData?: string;
};

export type Evento = {
  id: string;
  nome: string;
  slug: string;
  marca: Marca;
  cidade: string | null;
  uf: string | null;
  local: string | null;
  dataInicio: string;
  dataFim: string;
  status: StatusEvento;

  produtos: Produto[];
  faixas: Faixa[];
  regras: Regra[];
  metas: Meta[];
  desempate: CriterioDesempate;

  /** URL do painel de análise de dados — dashboard externo, fora deste app. */
  linkAnalise: string | null;

  /** URL base do sistema de assinatura de contratos (externo). Sem /novo. */
  linkContratos: string | null;

  criadoEm: string;
};

export type MembroEquipe = {
  eventoId: string;
  usuarioId: string;
  papelNoEvento: "gestor" | "closer";
  metaIndividual: number | null;
  ativo: boolean;
};

// ── Vendas ──────────────────────────────────────────────────────────────

/** Quanto cada regra rendeu, congelado no momento do registro. */
export type PontoDetalhe = { regraId: string; label: string; tag: string; pontos: number };

export type Venda = {
  /** Gerado no aparelho: reenviar é upsert do mesmo id, não venda duplicada. */
  id: string;
  eventoId: string;
  usuarioId: string;
  /** Desnormalizado: o histórico continua legível mesmo se o cadastro mudar. */
  closerNome: string;
  emailCloser: string;

  cliente: string;
  email: string | null;
  telefone: string | null;
  cpf: string | null;
  /** CEP do cliente — vai para o contrato, que busca o endereço. */
  cep: string | null;
  leadId: string | null;

  dataVenda: string | null;
  produto: string | null;
  produtoId: string | null;

  valor: number;
  recebido: number;
  faixa: number | null;
  faixaLabel: string | null;
  cadeira: boolean;
  valorCadeira: number;
  completo: boolean;
  restante: number;
  negociacao: string | null;
  observacao: string | null;

  pts: number;
  pontosDetalhe: PontoDetalhe[];

  contrato: string | null;
  contratoEm: string | null;
  criadoEm: string;
};

export type AcaoAuditoria = "criou" | "editou" | "excluiu" | "gerou_contrato" | "recalculou";

export type EventoAuditoria = {
  id: string;
  vendaId: string;
  acao: AcaoAuditoria;
  porUsuario: string | null;
  porNome: string;
  alteracoes: { campo: string; de: unknown; para: unknown }[] | null;
  em: string;
};

// ── Leads e links ───────────────────────────────────────────────────────

export type StatusLead = "novo" | "abordado" | "negociando" | "fechou" | "perdeu";

export type Lead = {
  id: string;
  eventoId: string;
  /** O que está impresso no QR do crachá. Único dentro do evento. */
  codigoCracha: string;
  tipo: string | null;
  nome: string;
  email: string | null;
  cpf: string | null;
  cep: string | null;
  telefone: string | null;
  especialidade: string | null;
  cor: string | null;

  status: StatusLead;
  abordadoPor: string | null;
  abordadoEm: string | null;
  motivoPerda: string | null;
};

export type LinkItem = {
  id: string;
  eventoId: string;
  vendedorNome: string;
  sck: string | null;
  status: string | null;
  oferta: string;
  valor: number | null;
  condicao: string | null;
  url: string;
};
