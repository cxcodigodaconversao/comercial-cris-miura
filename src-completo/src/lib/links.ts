// ─────────────────────────────────────────────────────────────────────────
// Manipulação das URLs de pagamento da Hotmart.
//
// O `sck` é o parâmetro de rastreio: é ele que diz de quem é a comissão.
// Todo vendedor recebe o MESMO catálogo de ofertas — muda só esse token.
// Por isso gerar o catálogo de alguém novo é trocar o sck de um catálogo
// que já existe, e não cadastrar 44 links na mão.
//
// Mexer nisso errado desvia comissão em silêncio, então a troca vive numa
// função só, testada.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Devolve a URL com o `sck` trocado. Preserva o resto — inclusive a ordem
 * dos outros parâmetros, para a URL continuar reconhecível ao lado das dos
 * colegas.
 *
 * Se a URL não tiver `sck`, ele é acrescentado: link de "casa" (sem dono)
 * é assim, e atribuí-lo a alguém é justamente adicionar o rastreio.
 */
export function trocarSck(url: string, novoSck: string): string {
  const token = novoSck.trim();
  if (!token) throw new Error("O token sck não pode ficar em branco.");

  // Sem `new URL()`: ele reordena e reescreve escapes, e essas URLs são
  // conferidas a olho contra o painel da Hotmart. Troca cirúrgica é melhor.
  if (/([?&])sck=/i.test(url)) {
    // Captura o nome do parâmetro para devolvê-lo como estava: se a origem
    // escreveu SCK, não é este código que vai decidir mudar para sck.
    return url.replace(/([?&])(sck)=[^&#]*/i, `$1$2=${encodeURIComponent(token)}`);
  }
  const separador = url.includes("?") ? "&" : "?";
  const [semAncora, ancora] = url.split("#");
  return `${semAncora}${separador}sck=${encodeURIComponent(token)}${ancora ? "#" + ancora : ""}`;
}

/**
 * Tira o `sck` da URL.
 *
 * É o que um link "de casa" precisa: sem dono. Deixar a URL como o admin
 * colou faria o link da casa carregar o token de quem por acaso estava
 * nela — e a venda pagaria comissão a essa pessoa.
 */
export function removerSck(url: string): string {
  return url
    .replace(/([?&])sck=[^&#]*&/i, "$1")
    .replace(/[?&]sck=[^&#]*/i, "")
    .replace(/\?&/, "?")
    .replace(/\?$/, "");
}

/**
 * Troca o código da oferta (`off=`) preservando o resto — inclusive o `sck`.
 *
 * Serve para corrigir uma oferta cadastrada errada sem refazer o link de
 * cada vendedor: o rastreio de cada um continua onde está, muda só para
 * onde o cliente é levado.
 */
export function trocarOferta(url: string, novaOferta: string): string {
  const oferta = novaOferta.trim();
  if (!oferta) throw new Error("O código da oferta não pode ficar em branco.");
  if (/([?&])off=/i.test(url)) {
    return url.replace(/([?&])(off)=[^&#]*/i, `$1$2=${encodeURIComponent(oferta)}`);
  }
  const separador = url.includes("?") ? "&" : "?";
  const [semAncora, ancora] = url.split("#");
  return `${semAncora}${separador}off=${encodeURIComponent(oferta)}${ancora ? "#" + ancora : ""}`;
}

/** Lê o `sck` de uma URL, ou null se não houver. */
export function lerSck(url: string): string | null {
  const m = url.match(/[?&]sck=([^&#]*)/i);
  return m ? decodeURIComponent(m[1]) : null;
}

/**
 * Lê o código da oferta (`off=`) da URL.
 *
 * É a chave que distingue uma oferta da outra na tabela, e está ali na URL
 * que o admin já colou — pedir para ele digitar de novo só criaria a chance
 * de digitar diferente e cadastrar a mesma oferta duas vezes.
 */
export function lerOferta(url: string): string | null {
  const m = url.match(/[?&]off=([^&#]*)/i);
  return m ? decodeURIComponent(m[1]) : null;
}

/**
 * O token vai dentro de uma URL e é conferido a olho no relatório da
 * Hotmart: espaço e acento viram escape e ficam ilegíveis lá.
 */
export function validarSck(sck: string): string | null {
  const t = sck.trim();
  if (!t) return "Informe o token de rastreio.";
  if (t.length < 2) return "O token é curto demais.";
  if (!/^[A-Za-z0-9._-]+$/.test(t)) {
    return "Use apenas letras, números, ponto, hífen ou sublinhado — sem espaço nem acento.";
  }
  return null;
}

/** Sugere um token a partir do nome: "Ana Paula Galvão" → "AnaPaula". */
export function sugerirSck(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join("");
}
