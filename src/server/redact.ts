import "server-only";
import { roleHas } from "./auth";
import type { Role } from "@/lib/settings/types";

/**
 * Field-level access for product cost price.
 *
 * The `products:financial` permission is meant to decide who can see cost price, but it was only ever a
 * UI rule — the sync API still sent `costPrice` / `variants[].cost` to every browser, so anyone could read
 * them from the network tab. These helpers enforce it on the server instead:
 *
 *   • `redactProductCost`   — strip cost from what a non-financial role is sent (read path).
 *   • `preserveProductCost` — on save, put the STORED cost back over whatever a non-financial role sent,
 *                             so redacting can never zero a real cost (e.g. a bulk stock update, which
 *                             re-saves the whole product, would otherwise write cost = 0).
 *
 * Order courier cost is deliberately NOT handled here: it is operational data entered at dispatch by roles
 * that may lack `orders:financial`, so preserving the stored value would discard what they legitimately type.
 */

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function canSeeProductCost(role: Role): boolean {
  return roleHas(role, "products", "financial");
}

/** Returns a copy of a product record with cost price and per-variant cost removed. */
export function redactProductCost(data: unknown): unknown {
  if (!isObj(data)) return data;
  const out: Record<string, unknown> = { ...data };
  delete out.costPrice;
  if (Array.isArray(out.variants)) {
    out.variants = out.variants.map((v) => {
      if (!isObj(v)) return v;
      const c: Record<string, unknown> = { ...v };
      delete c.cost;
      return c;
    });
  }
  return out;
}

/**
 * Overwrites the cost fields of `incoming` with the ones from `stored` (matched per variant by id), so a
 * role that can't see cost can't change it either. A brand-new record (no `stored`) is returned untouched.
 */
export function preserveProductCost(incoming: unknown, stored: unknown): unknown {
  if (!isObj(incoming) || !isObj(stored)) return incoming;
  const out: Record<string, unknown> = { ...incoming };
  if ("costPrice" in stored) out.costPrice = stored.costPrice;
  const storedVariants = Array.isArray(stored.variants) ? stored.variants.filter(isObj) : [];
  const costById = new Map<string, unknown>(storedVariants.map((v) => [String(v.id), v.cost]));
  if (Array.isArray(out.variants)) {
    out.variants = out.variants.map((v) => {
      if (!isObj(v)) return v;
      const prev = costById.get(String(v.id));
      return prev === undefined ? v : { ...v, cost: prev };
    });
  }
  return out;
}
