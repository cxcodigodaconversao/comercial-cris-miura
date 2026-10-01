import type { MetadataRoute } from "next";

/**
 * Torna o app instalável na tela de início do celular — é assim que o
 * vendedor abre no salão, sem barra de endereço e sem procurar o link.
 *
 * `display: standalone` e `orientation: portrait` porque o app é uma coluna
 * de 480px: em paisagem só sobraria margem dos dois lados.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Comercial Cristina Miura",
    short_name: "Cris Miura",
    description: "Registro de vendas, pontuação e metas do time comercial da operação da Cristina Miura",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F4F2EC",
    theme_color: "#F4F2EC",
    lang: "pt-BR",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
