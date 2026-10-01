"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Campos usam a classe `.inp` do globals.css em vez de utilitários soltos:
 * ela carrega as regras que o mobile exige (48px de altura, fonte 16px para
 * o iOS não dar zoom no foco) num lugar só.
 */

export function Field({
  label,
  hint,
  error,
  className,
  children,
}: {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("field", className)}>
      {label && <label>{label}</label>}
      {children}
      {hint && !error && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn("inp", className)} {...props} />
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn("inp min-h-[88px]", className)} {...props} />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select ref={ref} className={cn("inp", className)} {...props}>
    {children}
  </select>
));
Select.displayName = "Select";

/** Escolha binária Sim/Não — o padrão do formulário de venda. */
export function SimNao({
  value,
  onChange,
  simLabel = "Sim",
  naoLabel = "Não",
}: {
  value: boolean | null;
  onChange: (v: boolean) => void;
  simLabel?: string;
  naoLabel?: string;
}) {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        className="choice"
        data-state={value === true ? "sim" : undefined}
        onClick={() => onChange(true)}
      >
        {simLabel}
      </button>
      <button
        type="button"
        className="choice"
        data-state={value === false ? "nao" : undefined}
        onClick={() => onChange(false)}
      >
        {naoLabel}
      </button>
    </div>
  );
}

/**
 * Lista de opções exclusivas (rádio), em alvos grandes de toque.
 * A seleção é comparada pela CHAVE (`selected`), não pelo objeto — assim
 * funciona tanto com índice de faixa quanto com id de produto.
 */
export function OptionList<T>({
  options,
  selected,
  onChange,
  getKey,
  getLabel,
}: {
  options: T[];
  selected: string | null;
  onChange: (o: T, key: string) => void;
  getKey: (o: T, i: number) => string;
  getLabel: (o: T, i: number) => React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      {options.map((o, i) => {
        const key = getKey(o, i);
        return (
          <button
            key={key}
            type="button"
            className="option"
            data-selected={selected === key}
            onClick={() => onChange(o, key)}
          >
            <span className="option-dot" />
            <span className="flex-1 leading-tight">{getLabel(o, i)}</span>
          </button>
        );
      })}
    </div>
  );
}
