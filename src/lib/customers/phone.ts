import { normalizePhoneForCourier } from "@/lib/utils/phone";

/**
 * Cleans a phone to the local key used when grouping customers, without requiring it to be complete.
 * Mirrors the SQL normalization in `src/server/customers/query.ts`.
 */
export function normalizePhoneKey(raw: string | null | undefined): string {
  const cleaned = normalizePhoneForCourier(raw);
  return /^8801\d{9}$/.test(cleaned) ? `0${cleaned.slice(3)}` : cleaned;
}

/**
 * Turns the phone a staff member typed into the exact strings that may be stored on an order.
 *
 * `normalizePhoneForCourier` already converts Bangla digits and strips separators; the only extra
 * step here is moving a leading `880` (with or without `+`) into the local `01XXXXXXXXX` form.
 */
export function buildPhoneVariants(raw: string | null | undefined): { valid: boolean; local: string; variants: string[] } {
  const local = normalizePhoneKey(raw);
  if (!/^01\d{9}$/.test(local)) return { valid: false, local: "", variants: [] };

  const international = local.slice(1); // "1XXXXXXXXX", without the leading local 0
  return { valid: true, local, variants: [local, `880${international}`, `+880${international}`] };
}
