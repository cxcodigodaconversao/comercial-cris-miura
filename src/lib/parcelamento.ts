// ─────────────────────────────────────────────────────────────────────────
// Plano de pagamento estruturado.
//
// Existe para o promotor parar de descrever a negociação em texto corrido.
// Hoje o Gemini recebe coisas como "10000 dia 17/08 em 12x cartão" e tem
// que adivinhar o que é valor, data e forma; com campos separados ele deixa
// de interpretar e só redige.
//
// Tudo aqui é função pura: a validação é a parte que não pode errar, e é a
// única forma de testá-la sem subir tela.
// ─────────────────────────────────────────────────────────────────────────

export const FORMAS = [
  "PIX",
  "Cartão de crédito",
  "2 cartões de crédito",
  "Boleto",
  "Transferência",
  "Dinheiro",
] as const;

export type Forma = (typeof FORMAS)[number];

export type Parcela = {
  valor: number;
  forma: Forma;
  /** Cartão de crédito: número de vezes. */
  vezes?: number;
  /** 2 cartões: valor e vezes de cada um. O `valor` acima é a soma. */
  cartao1?: { valor: number; vezes?: number };
  cartao2?: { valor: number; vezes?: number };
  /** Data no formato YYYY-MM-DD, ou dias após a assinatura. */
  quando: "data" | "dias";
  data?: string;
  dias?: number;
};

export type Entrada = { valor: number; forma: Forma; data?: string };

export type Plano = {
  /** Quando ausente, é um plano avulso: não grava em venda nenhuma. */
  vendaId?: string;
  cliente?: string;
  valorTotal: number;
  entrada?: Entrada;
  parcelas: Parcela[];
};

export type Problema = { campo: string; mensagem: string; bloqueia: boolean };

/** Dinheiro em centavos: comparar float direto acusa diferença onde não há. */
const cent = (n: number) => Math.round((n || 0) * 100);

export function somaDoPlano(plano: Plano): number {
  // valorDaParcela, e não p.valor: em dois cartões o valor é derivado da
  // soma dos cartões, e usar o campo cru faria a parcela entrar como zero —
  // o plano nunca fecharia e o promotor não teria como descobrir por quê.
  const total =
    cent(plano.entrada?.valor ?? 0) +
    plano.parcelas.reduce((acc, p) => acc + cent(valorDaParcela(p)), 0);
  return total / 100;
}

/**
 * Diferença entre o valor da venda e o que foi lançado.
 * Positivo = falta lançar. Negativo = passou.
 */
export function diferenca(plano: Plano): number {
  return (cent(plano.valorTotal) - cent(somaDoPlano(plano))) / 100;
}

/**
 * Valor de uma parcela em dois cartões — sempre derivado, nunca digitado.
 * Deixar o promotor digitar o total E os dois cartões criaria um terceiro
 * número para conferir, e mais uma forma de o plano "não bater" por engano.
 */
export function valorDaParcela(p: Parcela): number {
  if (p.forma === "2 cartões de crédito") {
    return ((cent(p.cartao1?.valor ?? 0) + cent(p.cartao2?.valor ?? 0)) / 100);
  }
  return p.valor;
}

/**
 * Divide um valor em N parcelas iguais, com a última absorvendo os centavos.
 *
 * R$ 25.964,00 em 3 dá 8.654,666… Arredondando cada uma, a soma fecha em
 * 25.964,01 e o plano acusa erro por um centavo — o promotor perde minutos
 * sem entender de onde veio.
 */
export function dividir(valor: number, n: number): number[] {
  if (n < 1) return [];
  const totalCent = cent(valor);
  const base = Math.floor(totalCent / n);
  const partes = Array<number>(n).fill(base);
  partes[n - 1] = totalCent - base * (n - 1);
  return partes.map((c) => c / 100);
}

/**
 * Tudo que impede (ou merece aviso antes de) gerar o texto.
 * `bloqueia: false` é aviso: às vezes o caso estranho é intencional.
 */
export function validar(plano: Plano): Problema[] {
  const problemas: Problema[] = [];

  if (cent(plano.valorTotal) <= 0) {
    problemas.push({ campo: "valorTotal", mensagem: "Informe o valor total.", bloqueia: true });
  }

  const lancado = cent(somaDoPlano(plano));
  if (lancado <= 0) {
    problemas.push({
      campo: "plano",
      mensagem: "Nenhum valor lançado ainda.",
      bloqueia: true,
    });
  }

  if (plano.entrada && cent(plano.entrada.valor) > cent(plano.valorTotal)) {
    problemas.push({
      campo: "entrada",
      mensagem: "A entrada é maior que o valor total. Quase sempre é dígito trocado.",
      bloqueia: true,
    });
  }

  plano.parcelas.forEach((p, i) => {
    const valor = valorDaParcela(p);
    if (cent(valor) <= 0) {
      problemas.push({
        campo: `parcela.${i}`,
        mensagem: `Parcela ${i + 1} está sem valor. Preencha ou remova.`,
        bloqueia: true,
      });
    }
    if (p.forma === "Cartão de crédito" && p.vezes !== undefined && p.vezes < 1) {
      problemas.push({
        campo: `parcela.${i}.vezes`,
        mensagem: `Parcela ${i + 1}: número de vezes inválido.`,
        bloqueia: true,
      });
    }
    if (p.forma === "2 cartões de crédito") {
      if (cent(p.cartao1?.valor ?? 0) <= 0 || cent(p.cartao2?.valor ?? 0) <= 0) {
        problemas.push({
          campo: `parcela.${i}.cartoes`,
          mensagem: `Parcela ${i + 1}: informe o valor dos dois cartões.`,
          bloqueia: true,
        });
      }
    }
    if (p.quando === "dias" && (!p.dias || p.dias < 1)) {
      problemas.push({
        campo: `parcela.${i}.dias`,
        mensagem: `Parcela ${i + 1}: informe em quantos dias.`,
        bloqueia: true,
      });
    }
    if (p.quando === "data" && !p.data) {
      problemas.push({
        campo: `parcela.${i}.data`,
        mensagem: `Parcela ${i + 1}: informe a data.`,
        bloqueia: true,
      });
    }
  });

  // Datas fora de ordem só avisam: pagamento adiantado acontece.
  const datas = plano.parcelas
    .filter((p) => p.quando === "data" && p.data)
    .map((p) => p.data as string);
  const ordenadas = [...datas].sort();
  if (datas.length > 1 && datas.join() !== ordenadas.join()) {
    problemas.push({
      campo: "ordem",
      mensagem: "As parcelas não estão em ordem de data. Confira se é isso mesmo.",
      bloqueia: false,
    });
  }

  const dif = cent(plano.valorTotal) - lancado;
  if (lancado > 0 && dif !== 0) {
    problemas.push({
      campo: "soma",
      mensagem:
        dif > 0
          ? `Faltam ${fmt(dif / 100)} — o plano não fecha com o valor total.`
          : `O plano passa ${fmt(Math.abs(dif) / 100)} do valor total.`,
      bloqueia: true,
    });
  }

  return problemas;
}

export const podeGerar = (plano: Plano) => !validar(plano).some((p) => p.bloqueia);

const fmt = (n: number) =>
  "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Traduz o plano para as linhas que vão ao Gemini.
 *
 * Texto, e não JSON, de propósito: o modelo já recebe hoje um bloco de
 * "campo: valor" e a instrução do sistema foi escrita para esse formato.
 */
export function descreverParaIA(plano: Plano): string {
  const linhas: string[] = [];
  if (plano.cliente) linhas.push(`Cliente: ${plano.cliente}`);
  linhas.push(`Valor total: ${fmt(plano.valorTotal)}`);

  if (plano.entrada && plano.entrada.valor > 0) {
    linhas.push(
      `Entrada: ${fmt(plano.entrada.valor)} via ${plano.entrada.forma}` +
        (plano.entrada.data ? ` em ${dataBR(plano.entrada.data)}` : "")
    );
  }

  plano.parcelas.forEach((p, i) => {
    const quando =
      p.quando === "dias"
        ? `${p.dias} dias após a assinatura`
        : p.data
          ? dataBR(p.data)
          : "data a combinar";

    let forma: string;
    if (p.forma === "2 cartões de crédito") {
      const c1 = p.cartao1;
      const c2 = p.cartao2;
      forma =
        `dividido em 2 cartões de crédito — ` +
        `${fmt(c1?.valor ?? 0)}${c1?.vezes ? ` em ${c1.vezes}x` : ""} no primeiro cartão e ` +
        `${fmt(c2?.valor ?? 0)}${c2?.vezes ? ` em ${c2.vezes}x` : ""} no segundo cartão`;
    } else if (p.forma === "Cartão de crédito" && p.vezes) {
      forma = `${p.vezes}x no cartão de crédito`;
    } else {
      forma = p.forma;
    }

    linhas.push(`Parcela ${i + 1}: ${fmt(valorDaParcela(p))} — ${forma} — ${quando}`);
  });

  return linhas.join("\n");
}

/** YYYY-MM-DD → DD/MM/AAAA, que é o formato pedido no contrato. */
export function dataBR(iso: string): string {
  const [a, m, d] = iso.split("-");
  return d && m && a ? `${d}/${m}/${a}` : iso;
}
