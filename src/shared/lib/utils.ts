import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Canonical className composer: conditional classes via clsx, then Tailwind
 * conflict resolution via tailwind-merge (later classes win).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
