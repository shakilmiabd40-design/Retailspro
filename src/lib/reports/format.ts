import { runtime } from "@/lib/settings/runtime";

/** Whole taka when possible, two decimals otherwise. Negative amounts read as -৳120. */
export function taka(value: number): string {
  const abs = Math.abs(value);
  const whole = Math.abs(abs - Math.round(abs)) < 0.005;
  const text = abs.toLocaleString(runtime.locale, { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 });
  return `${value < 0 ? "-" : ""}\u09F3${text}`;
}

export const num = (v: number) => v.toLocaleString(runtime.locale);

export function pct(part: number, whole: number): string {
  return whole ? `${Math.round((part / whole) * 1000) / 10}%` : "0%";
}

export function sum<T>(items: T[], fn: (t: T) => number): number {
  return items.reduce((s, i) => s + fn(i), 0);
}

export function ymd(d: Date | null | undefined): string {
  if (!d || Number.isNaN(d.getTime())) return "";
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
