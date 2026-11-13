// ─────────────────────────────────────────────────────────────────────────
// O que a Mentoria DSD entrega — base fixa do analisador de abordagens.
//
// Tirado dos materiais de venda que o Everton enviou em 13/11/2026 (planilha
// e duas apresentações do pitch). Vale para toda a equipe, em qualquer
// aparelho: antes, cada um tinha de escrever isso na tela.
//
// TRÊS pontos ficaram de fora DE PROPÓSITO, porque os materiais não
// respondem ou se contradizem, e a análise vai para o palco:
//   - duração da mentoria (não consta);
//   - preço e parcelamento (o slide mostra "R$ 60.000" e "12x R$ 2.997",
//     que não batem entre si);
//   - quantos encontros são diretamente com a Dra. Cristina (não consta).
// O prompt proíbe a IA de afirmar qualquer um deles. Só entram aqui depois
// que o Everton confirmar.
// ─────────────────────────────────────────────────────────────────────────

export const MENTORIA_DSD = `Nome: Mentoria DSD (Dentistas que Salvam Dentes), da Dra. Cristina Miura.

O que é: um acelerador de resultados com métodos, ferramentas e acompanhamento de perto para quem quer ultrapassar R$ 20.000 por mês de TPNC e PIC (prevenção), com segurança clínica e longevidade de resultados. Sem precisar reformar o consultório e sem precisar ser periodontista.

Para quem é: clínico geral, implantodontista, ortodontista ou periodontista que quer salvar dentes, ter segurança em casos complexos (diabéticos, tabagistas, hipertensos, idosos, mobilidade grau 3, furca, endo-perio, orto-perio, peri-implantite) e ter alguém dizendo o que, quando e como fazer.

Como funciona (4 pilares): Direcionamento, Feedback, Comunidade e Acompanhamento. O acompanhamento é da Dra. Cristina com o corpo docente.

O que o aluno recebe:
- 1 Diagnóstico e Planejamento da Rota
- 10 DIPTs (Discussão Individual do Plano de Tratamento)
- 6 AIAs (Análise Individual de Atendimento)
- 12 Dias de Prática (DDP): online ao vivo com o corpo docente; o aluno executa e é corrigido na hora
- Comunidade DSD no WhatsApp (casos clínicos liberados, resposta em até 6h úteis)
- Hotseats (5 dentistas + 1 DSD, 1h no Zoom)
- 2 encontros presenciais por ano, exclusivos, de 2 dias
- 1 Desafio 20k em 60 dias + 4 Desafios 10k de PIC (campanhas prontas: anúncios, roteiros e scripts)
- Indicações de pacientes pelo SNIPP + central própria (CRC) para agendar esses leads
- App DSD (financeiro e progresso)
- 5 plantões de dúvidas financeiras, Curso do TSB no TPNC, Curso Secretária que Salva Dentes
- Placa de certificação Dentista que Salva Dentes
- Bônus: Pós-Graduação em TPNC (360 h/aula, até 24 meses para concluir)

Garantia: quem aplicar o passo a passo e não recuperar o investimento recebe o dinheiro de volta + R$ 5.000.
Segunda cadeira com 50% para sócio, funcionário ou cônjuge.`;

/** O que a IA não pode afirmar enquanto não houver confirmação. Vai no prompt. */
export const NAO_CONFIRMADO_DSD = [
  "a duração da mentoria",
  "o preço, o valor das parcelas ou a forma de pagamento",
  "quantos encontros são diretamente com a Dra. Cristina",
];
