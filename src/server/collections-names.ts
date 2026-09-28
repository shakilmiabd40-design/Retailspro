// Names shared by the server routes and the browser sync layer (no server-only imports here).
export const COLLECTION_NAMES = ["products", "orders", "suppliers", "purchase_orders", "returns", "warranties", "pos_invoices", "pos_sessions", "pos_returns", "pos_held", "accounts", "ledger"] as const;
export const DOCUMENT_KEYS = ["settings", "catalog", "settlements", "notifications_data", "notifications_settings"] as const;
export type CollectionName = (typeof COLLECTION_NAMES)[number];
export type DocumentKey = (typeof DOCUMENT_KEYS)[number];
