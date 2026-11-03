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
 *
 * Steadfast status reference (as seen in live payloads and their Laravel SDK):
 *   in_review                    → Processing (pending Steadfast acceptance; we map to null)
 *   pending                      → In Transit (accepted by Steadfast and in transit)
 *   in_transit                   → In Transit
 *   delivered                    → Delivered
 *   partial_delivered            → Partial Delivered
 *   partial_delivered_return_*   → Partial Delivered (parcel returning after partial delivery)
 *   cancelled                    → Refuse Return (courier cancelled = parcel coming back)
 *   cancelled_return_*           → Refuse Return
 *   return_list                  → Refuse Return (added to return manifest)
 *   returned                     → Refuse Return (physically returned to merchant)
 *   hold                         → null (on hold; awaiting action)
 *   *_approval_pending           → null (unconfirmed rider claim)
 *   unknown / exceptional        → null (needs human review)
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

  // A courier cancellation means the parcel is coming back, so it is a Refuse Return in
  // RetailsPro. `cancelled` is reserved for orders cancelled before they reached the courier.
  // Covers: cancelled, cancelled_return_*, return_list, returned.
  if (s.startsWith("cancelled") || s === "return_list" || s === "returned") return "refuse_return";

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

/**
 * The amount the customer actually paid. Steadfast's webhook calls it `cod_amount`, but older
 * accounts and the status lookup use other names, so read them all in one place. Fields that
 * explicitly mean "collected" win over the original `cod_amount` when both are present. A missing
 * value stays `null` (unknown) and never overwrites what the order already has.
 */
export function readPaidAmount(source: Record<string, unknown> | null | undefined): number | null {
  if (!source) return null;
  const keys = [
    "collected_amount",
    "collectedAmount",
    "paid_amount",
    "paidAmount",
    "customer_paid",
    "customerPaid",
    "received_amount",
    "receivedAmount",
    "cod_amount",
    "codAmount",
    "amount",
  ];
  for (const key of keys) {
    const value = toAmount(source[key]);
    if (value !== null) return value;
  }
  return null;
}
