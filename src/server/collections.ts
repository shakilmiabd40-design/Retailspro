import type { ModuleKey, ActionKey } from "@/lib/settings/types";
import type { Role } from "@/lib/settings/types";
import { roleHas } from "./auth";

/**
 * What the sync API is willing to store, and who may read / write it. Access is deliberately
 * coarse (per collection, not per field): the order screens legitimately touch products (stock
 * reservation), warranties and the settlement ledger, so those collections accept writes from every
 * module that can cause them. Field-level rules (e.g. hiding cost price) remain a UI concern.
 */
import { COLLECTION_NAMES, DOCUMENT_KEYS, type CollectionName, type DocumentKey } from "./collections-names";

export { COLLECTION_NAMES, DOCUMENT_KEYS };
export type { CollectionName, DocumentKey };

type Access = { read: ModuleKey[] | "any"; write: ModuleKey[] | "any" };

const WRITE_ACTIONS: ActionKey[] = ["create", "edit", "delete", "approve", "update_status", "settlement"];

export const COLLECTION_ACCESS: Record<CollectionName, Access> = {
  products: { read: "any", write: ["products", "inventory", "orders", "purchase", "returns", "warranty", "pos"] },
  orders: { read: "any", write: ["orders", "settlement", "returns", "courier", "pos"] },
  suppliers: { read: ["suppliers", "purchase", "reports"], write: ["suppliers"] },
  purchase_orders: { read: ["purchase", "suppliers", "reports"], write: ["purchase", "inventory"] },
  returns: { read: "any", write: ["returns", "orders"] },
  warranties: { read: "any", write: ["warranty", "orders", "returns", "pos"] },
  // POS: a sale touches products (stock), warranties and — for delivery orders — orders, hence the "pos" entries above.
  pos_invoices: { read: ["pos", "accounting"], write: ["pos"] }, // accounting reads walk-in sales for profit & loss
  pos_sessions: { read: ["pos"], write: ["pos"] },
  pos_returns: { read: ["pos"], write: ["pos"] },
  pos_held: { read: ["pos"], write: ["pos"] },
  // Accounting: money accounts and the ledger of expenses / other income / transfers. These hold
  // sensitive detail (salaries, who was paid, notes), so only the Accounting permission can read them —
  // NOT "reports", even though profit & loss is reachable from the Reports area for some roles. A role
  // with only Reports permission must not be able to pull raw ledger rows via the sync API.
  accounts: { read: ["accounting"], write: ["accounting"] },
  ledger: { read: ["accounting"], write: ["accounting"] },
};

export const DOCUMENT_ACCESS: Record<DocumentKey, Access> = {
  settings: { read: "any", write: ["settings"] },
  catalog: { read: "any", write: ["products", "inventory", "settings"] },
  settlements: { read: ["settlement", "reports", "orders", "courier"], write: ["settlement", "orders"] },
  // The shared alert list + read state is computed and persisted by whichever browser is open when stock
  // changes (any role), so it stays writable by everyone. The *settings* (thresholds, channels, who gets
  // the low-stock email) are only ever changed from the Notifications/Inventory settings screens, so they
  // follow the app's usual rule: a write action in inventory or settings is required — not just any session.
  notifications_data: { read: "any", write: "any" },
  notifications_settings: { read: "any", write: ["inventory", "settings"] },
};

export const isCollection = (n: string): n is CollectionName => (COLLECTION_NAMES as readonly string[]).includes(n);
export const isDocument = (n: string): n is DocumentKey => (DOCUMENT_KEYS as readonly string[]).includes(n);

export function canRead(role: Role, a: Access): boolean {
  return a.read === "any" || a.read.some((m) => roleHas(role, m, "view"));
}

export function canWrite(role: Role, a: Access): boolean {
  if (a.write === "any") return true;
  return a.write.some((m) => WRITE_ACTIONS.some((act) => roleHas(role, m, act)));
}

/** Starting values of the number sequences (what the app used before). */
export const COUNTER_START: Record<string, number> = { order: 10241, po: 3002, return: 5001, warranty: 1001, claim: 2001, pos_invoice: 1001, pos_return: 1001, pos_session: 1001, barcode: 100001 };
