/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // SSR (Vercel): rotas de API funcionam, a chave do Gemini fica no
  // servidor (env da Vercel) e nunca vai pro navegador.
};

export default nextConfig;
