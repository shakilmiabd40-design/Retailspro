import { runtime } from "@/lib/settings/runtime";

/** Dashboard money is shown in Bangladeshi Taka, matching the rest of the app (see formatTaka in products/utils). */
export function formatCurrency(value: number, opts: { decimals?: number } = {}): string {
  const { decimals = runtime.decimals } = opts;
  return `\u09F3${value.toLocaleString(runtime.locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export function formatCompact(value: number): string {
  return value.toLocaleString(runtime.locale);
}
