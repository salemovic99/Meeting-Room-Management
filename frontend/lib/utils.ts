import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");
}

/** Stable color per id (used for calendar room colors). */
const PALETTE = ["#00594F", "#BB9D5A", "#2563EB", "#9333EA", "#DB2777", "#EA580C", "#0891B2", "#65A30D"];
export function colorFor(id: string, index?: number): string {
  if (typeof index === "number") return PALETTE[index % PALETTE.length];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
