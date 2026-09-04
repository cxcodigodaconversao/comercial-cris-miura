import type { Venda } from "./types";

/**
 * Tradução snake_case (banco) ↔ camelCase (app), num lugar só.
 *
 * Na LEITURA, o próprio PostgREST renomeia com `apelido:coluna` — não passa
 * nenhum objeto por um mapeador em JavaScript, e uma coluna esquecida vira
 * erro de consulta em vez de `undefined` silencioso na tela.
 *
 * Na ESCRITA não há esse recurso, então existem as funções abaixo.
 */

export const SELECT_USUARIO =
  "id, email, nome, papel, ativo, sck, telefone, " +
  "precisaTrocarSenha:precisa_trocar_senha, criadoEm:criado_em, " +
  "criadoPor:criado_por, desativadoEm:desativado_em";

export const SELECT_EVENTO =
  "id, nome, slug, marca, cidade, uf, local, " +
  "dataInicio:data_inicio, dataFim:data_fim, status, " +
  "produtos, faixas, regras, metas, desempate, linkAnalise:link_analise, linkContratos:link_contratos, criadoEm:criado_em";

export const SELECT_VENDA =
  "id, eventoId:evento_id, usuarioId:usuario_id, closerNome:closer_nome, " +
  "emailCloser:email_closer, cliente, email, telefone, cpf, cep, leadId:lead_id, " +
  "dataVenda:data_venda, produto, produtoId:produto_id, valor, recebido, " +
  "faixa, faixaLabel:faixa_label, cadeira, valorCadeira:valor_cadeira, " +
  "completo, restante, negociacao, observacao, pts, " +
  "pontosDetalhe:pontos_detalhe, contrato, contratoEm:contrato_em, " +
  "criadoEm:criado_em";

export const SELECT_LEAD =
  "id, eventoId:evento_id, codigoCracha:codigo_cracha, tipo, nome, email, cpf, cep, " +
  "telefone, especialidade, cor, status, abordadoPor:abordado_por, " +
  "abordadoEm:abordado_em, motivoPerda:motivo_perda";

export const SELECT_LINK =
  "id, eventoId:evento_id, vendedorNome:vendedor_nome, sck, status, oferta, " +
  "valor, condicao, url";

export const SELECT_AUDITORIA =
  "id, vendaId:venda_id, acao, porUsuario:por_usuario, porNome:por_nome, alteracoes, em";

/** Campos de venda que a tela edita — usado no insert e no update. */
export type CamposVenda = Omit<Venda, "criadoEm" | "contrato" | "contratoEm">;

export function vendaParaLinha(v: Partial<CamposVenda>) {
  const linha: Record<string, unknown> = {};
  const põe = (coluna: string, valor: unknown) => {
    if (valor !== undefined) linha[coluna] = valor;
  };

  põe("id", v.id);
  põe("evento_id", v.eventoId);
  põe("usuario_id", v.usuarioId);
  põe("closer_nome", v.closerNome);
  põe("email_closer", v.emailCloser);
  põe("cliente", v.cliente);
  põe("email", v.email);
  põe("telefone", v.telefone);
  põe("cpf", v.cpf);
  põe("cep", v.cep);
  põe("lead_id", v.leadId);
  põe("data_venda", v.dataVenda || null); // input date vazio é "", não null
  põe("produto", v.produto);
  põe("produto_id", v.produtoId);
  põe("valor", v.valor);
  põe("recebido", v.recebido);
  põe("faixa", v.faixa);
  põe("faixa_label", v.faixaLabel);
  põe("cadeira", v.cadeira);
  põe("valor_cadeira", v.valorCadeira);
  põe("completo", v.completo);
  põe("restante", v.restante);
  põe("negociacao", v.negociacao);
  põe("observacao", v.observacao);
  põe("pts", v.pts);
  põe("pontos_detalhe", v.pontosDetalhe);

  return linha;
}

/** Rótulo legível de cada coluna, para o log de auditoria e as mensagens. */
export const NOME_DO_CAMPO: Record<string, string> = {
  cliente: "cliente",
  email: "e-mail",
  telefone: "telefone",
  dataVenda: "data da venda",
  valor: "valor da venda",
  recebido: "valor recebido",
  faixa: "faixa",
  faixaLabel: "faixa",
  cadeira: "2ª cadeira",
  valorCadeira: "valor da 2ª cadeira",
  completo: "recebimento completo",
  restante: "valor restante",
  negociacao: "negociação do restante",
  observacao: "observação",
  pts: "pontos",
  pontosDetalhe: "detalhe da pontuação",
};

export const SELECT_INSCRITO =
  "email, nome, whatsapp, classe, nota, perfil, comprometimento, tipo, jaAluno:ja_aluno, " +
  "faturamento, idade, tempoFormado:tempo_formado, areaAtuacao:area_atuacao, " +
  "categoriaTicket:categoria_ticket, temProduto:tem_produto, produtos, " +
  "checkinFeito:checkin_feito, d1, d2, d3, ligou, resultadoLigacao:resultado_ligacao, " +
  "contatoConfirmou:contato_confirmou, extras";
