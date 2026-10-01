import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Junta classes condicionais e resolve conflitos do Tailwind (o último vence). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
