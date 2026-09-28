/**
 * Live formatting / policy values that plain (non-React) helpers need —
 * formatTaka(), stockStatusFor(), canCancelOrder() and friends.
 *
 * The SettingsProvider mirrors the saved settings into this object while it
 * renders (an idempotent write, so it is safe under StrictMode), which means
 * every component rendered afterwards sees the current values without having
 * to subscribe to the settings context.
 */
import type { DateFormat, SettlementMode } from "./types";

export interface RuntimeConfig {
  locale: string;
  decimals: number;
  dateFormat: DateFormat;
  timezone: string;
  lowStockThreshold: number;
  cancelAllowed: string[];
  settlementMode: SettlementMode;
  /** Who is acting right now — stamped onto activity / audit entries. */
  actor: { id: string; name: string };
}

export const runtime: RuntimeConfig = {
  locale: "en-US",
  decimals: 0,
  dateFormat: "DD-MM-YYYY",
  timezone: "Asia/Dhaka",
  lowStockThreshold: 10,
  cancelAllowed: ["pending", "processing"],
  settlementMode: "auto_override",
  actor: { id: "system", name: "System" },
};

export function applyRuntime(patch: Partial<RuntimeConfig>) {
  Object.assign(runtime, patch);
}

function partsFor(d: Date, withTime: boolean, timezone: string = runtime.timezone) {
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      ...(withTime ? { hour: "numeric", minute: "2-digit", hour12: true } : {}),
    });
  } catch {
    fmt = new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "2-digit", day: "2-digit", ...(withTime ? { hour: "numeric", minute: "2-digit", hour12: true } : {}) });
  }
  const map: Record<string, string> = {};
  for (const p of fmt.formatToParts(d)) map[p.type] = p.value;
  return map;
}

/** 20-09-2026 (or the configured order), in the configured timezone. */
export function formatDate(input: string | number | Date | undefined | null, opts?: { dateFormat?: DateFormat; timezone?: string }): string {
  if (!input) return "—";
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "—";
  const p = partsFor(d, false, opts?.timezone);
  switch (opts?.dateFormat ?? runtime.dateFormat) {
    case "MM-DD-YYYY":
      return `${p.month}-${p.day}-${p.year}`;
    case "YYYY-MM-DD":
      return `${p.year}-${p.month}-${p.day}`;
    default:
      return `${p.day}-${p.month}-${p.year}`;
  }
}

/** Date plus a 12-hour clock time, e.g. 20-09-2026, 2:45 PM. */
export function formatDateTime(input: string | number | Date | undefined | null): string {
  if (!input) return "—";
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "—";
  const p = partsFor(d, true);
  const time = `${p.hour}:${p.minute} ${(p.dayPeriod ?? "").toUpperCase()}`.trim();
  return `${formatDate(d)}, ${time}`;
}

export function shortDevice(): string {
  if (typeof navigator === "undefined") return "";
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}
