/**
 * Marca do app. Dente estilizado — as cores saem de `--brand` / tokens:
 * no multi-evento a cor pertence ao EVENTO selecionado, não ao app.
 */
export function Logo({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      className={className}
      style={{ flexShrink: 0 }}
      role="img"
      aria-label="Comercial"
    >
      <rect width="40" height="40" rx="9" fill="var(--brand)" />
      {/* Dente: coroa arredondada com duas raízes */}
      <path
        d="M 20 9
           C 15.5 9, 12 11.4, 12 16.2
           C 12 20.4, 13.3 24.3, 14.4 28.6
           C 14.9 30.5, 17.1 30.6, 17.6 28.6
           C 18.1 26.6, 18.7 23.8, 20 23.8
           C 21.3 23.8, 21.9 26.6, 22.4 28.6
           C 22.9 30.6, 25.1 30.5, 25.6 28.6
           C 26.7 24.3, 28 20.4, 28 16.2
           C 28 11.4, 24.5 9, 20 9 Z"
        fill="var(--accent-foreground)"
      />
      {/* Brilho: um dente "cuidado" */}
      <path
        d="M 16.5 13.5 C 16.5 12, 18 11, 19.5 11.2"
        fill="none"
        stroke="var(--brand)"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.6"
      />
    </svg>
  );
}
