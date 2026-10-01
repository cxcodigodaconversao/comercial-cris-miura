import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Portado do DTC (dtc-navegacao/src/components/ui/button.tsx), com os tamanhos
 * subidos: aqui o botão é apertado com o polegar, em pé, no salão do evento.
 * `md` tem 48px de altura — o mínimo confortável para toque.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors focus-visible:ring-focus disabled:pointer-events-none disabled:opacity-50 select-none",
  {
    variants: {
      variant: {
        // CTA principal = tinta sólida
        primary: "bg-foreground text-background hover:bg-foreground/88",
        // Ênfase secundária = acento spruce
        accent: "bg-accent text-accent-foreground hover:bg-accent/90",
        // Marca do evento selecionado
        brand: "bg-brand text-accent-foreground hover:opacity-90",
        outline: "border border-border-strong bg-card text-foreground hover:bg-muted",
        ghost: "text-foreground hover:bg-muted",
        subtle: "bg-muted text-foreground hover:bg-border/60",
        danger: "bg-destructive text-white hover:bg-destructive/90",
        "danger-outline": "border border-destructive/40 text-destructive hover:bg-destructive/8",
        link: "text-accent underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-9 px-3.5 text-sm",
        md: "h-12 px-5 text-[15px]",
        lg: "h-14 px-6 text-base font-semibold",
        icon: "h-11 w-11",
        "icon-sm": "h-9 w-9",
      },
      full: { true: "w-full" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, full, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size, full }), className)} {...props} />
  )
);
Button.displayName = "Button";

export { buttonVariants };
