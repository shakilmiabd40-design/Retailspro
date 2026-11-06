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
  const collectedKeys = ["collected_amount", "collectedAmount", "paid_amount", "paidAmount", "customer_paid", "customerPaid", "received_amount", "receivedAmount"];
  const codKeys = [
    "cod_amount",
    "codAmount",
    "amount",
  ];
  for (const key of collectedKeys) {
    const value = toAmount(source[key]);
    if (value !== null) return value;
  }
  for (const key of codKeys) {
    const value = toAmount(source[key]);
    if (value !== null) return value;
  }
  return null;
}

function readExplicitCollectedAmount(source: Record<string, unknown> | null | undefined): number | null {
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
  ];
  for (const key of keys) {
    const value = toAmount(source[key]);
    if (value !== null) return value;
  }
  return null;
}

const BENGALI_DIGITS: Record<string, string> = { "০": "0", "১": "1", "২": "2", "৩": "3", "৪": "4", "৫": "5", "৬": "6", "৭": "7", "৮": "8", "৯": "9" };

/** Read an explicit taka amount from the rider's note, including Bengali numerals. */
export function readRiderNoteAmount(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const noteMarker = /rider\s*note|রাইডার\s*নোট/i.exec(raw);
  if (!noteMarker) return null;
  const note = raw.slice(noteMarker.index + noteMarker[0].length).replace(/[০-৯]/g, (digit) => BENGALI_DIGITS[digit]);
  const amount = /(?:৳\s*([\d,]+(?:\.\d+)?)|([\d,]+(?:\.\d+)?)\s*(?:টাকা|taka\b|tk\b|bdt\b))/i.exec(note);
  return toAmount(amount?.[1] ?? amount?.[2]);
}

/** Pick the newest tracking-history message containing a rider note. */
export function readLatestRiderTrackingMessage(raw: unknown): string | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const body = raw as Record<string, unknown>;
  const data = body.data && typeof body.data === "object" && !Array.isArray(body.data) ? body.data as Record<string, unknown> : null;
  const records = Array.isArray(body.tracking) ? body.tracking : Array.isArray(data?.tracking) ? data.tracking : Array.isArray(body.data) ? body.data : [];
  const notes = records.flatMap((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const message = typeof record.text === "string" ? record.text : typeof record.tracking_message === "string" ? record.tracking_message : "";
    if (readRiderNoteAmount(message) === null) return [];
    const date = Date.parse(String(record.created_at ?? record.updated_at ?? ""));
    return [{ message, index, date: Number.isFinite(date) ? date : null }];
  });
  notes.sort((a, b) => a.date !== null && b.date !== null ? a.date - b.date || a.index - b.index : a.index - b.index);
  return notes.at(-1)?.message ?? null;
}

/** Prefer explicit collected figures, then an explicit rider-note taka amount, then COD fields. */
export function readCourierPaidAmount(event: Record<string, unknown> | null | undefined, consignment?: Record<string, unknown> | null): number | null {
  const values = event?.values && typeof event.values === "object" && !Array.isArray(event.values)
    ? event.values as Record<string, unknown>
    : null;
  const trackingMessage = values?.tracking_message ?? event?.tracking_message ?? consignment?.tracking_message;
  // `consignment_update` carries changed fields in `values`; prefer those over any stale
  // top-level COD value included alongside the change metadata.
  const collected = readExplicitCollectedAmount(values) ?? readExplicitCollectedAmount(consignment) ?? readExplicitCollectedAmount(event);
  if (collected !== null) return collected;
  const riderNote = readRiderNoteAmount(trackingMessage);
  if (riderNote !== null) return riderNote;
  const changedCod = readPaidAmount(values);
  if (changedCod !== null) return changedCod;
  return readPaidAmount(consignment) ?? readPaidAmount(event);
}
