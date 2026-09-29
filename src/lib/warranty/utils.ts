import type { Warranty, WarrantyStatus } from "./types";

export const WARRANTY_PERIOD_DAYS = 365;

export const WARRANTY_STATUS_LABELS: Record<WarrantyStatus, string> = {
  active: "Active",
  expired: "Expired",
  claimed: "Claimed",
  closed: "Closed",
  void: "Void",
};

/** Recomputes Active → Expired purely from today's date vs end_date (display-time only; doesn't mutate storage). */
export function effectiveStatus(w: Warranty): WarrantyStatus {
  if (w.status === "void" || w.status === "closed" || w.status === "claimed") return w.status;
  return new Date(w.endDate).getTime() < Date.now() ? "expired" : "active";
}

export function daysLeft(w: Warranty): number {
  const diff = new Date(w.endDate).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function canClaim(w: Warranty): boolean {
  const status = effectiveStatus(w);
  return status === "active" && new Date(w.endDate).getTime() >= Date.now();
}
