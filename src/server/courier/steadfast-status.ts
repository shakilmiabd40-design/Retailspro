import type { OrderStatus } from "@/lib/orders/types";

/**
 * Steadfast sends a consignment status as a free-form string — "pending", "in_review",
 * "partial_delivered", "partial_delivered_approval_pending", "Cancelled", … — and the exact
 * casing/separator has changed between their dashboard docs and the API. Normalising first keeps
 * the mapping in one place instead of scattering `status === "…"` checks around.
 */
export function normalizeSteadfastStatus(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

/**
 * Maps a Steadfast consignment status onto a RetailPro order status.
 *
 * `null` means "leave the order where it is":
 *   - `in_review` (freshly booked, waiting for Steadfast's approval) and `hold` keep the order in Processing
 *   - `*_approval_pending` is only a rider's claim, not a confirmed outcome
 *   - `unknown` / `exceptional` need a human, so we don't guess a status for them
 */
export function mapSteadfastStatus(raw: unknown): OrderStatus | null {
  const s = normalizeSteadfastStatus(raw);
  if (!s) return null;
  if (s.endsWith("approval_pending")) return null;

  // `pending` here means "booked and accepted by Steadfast, not delivered yet" — i.e. the parcel
  // is with the courier, so the order is In Transit (this is also the in_review → pending move).
  if (s === "pending" || s === "in_transit") return "in_transit";
  if (s === "delivered") return "delivered";
  // Covers partial_delivered and the partial_delivered_return_* follow-ups.
  if (s.startsWith("partial_delivered")) return "partial_delivered";
  // Covers cancelled and cancelled_return_*.
  if (s.startsWith("cancelled")) return "cancelled";
  return null;
}

/**
 * Steadfast sends amounts as numbers *or* numeric strings ("100.00"), and omits them entirely when
 * unknown. Returns `null` for "not reported", which is different from 0.
 */
export function toAmount(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
