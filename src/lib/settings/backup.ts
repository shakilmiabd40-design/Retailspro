/**
 * Data used to live only in this browser's localStorage. These helpers find any leftovers so a Super Admin
 * can move them into the database once (Settings → Data → "Move this browser's data").
 */
const PREFIX = "retailpro:";
/** Keys that hold shop data (users / audit from the old demo aren't migrated). */
const DATA_KEYS = ["products", "catalog", "suppliers", "orders", "purchase-orders", "returns", "warranty", "settlements", "settings", "notifications", "notification-settings"];

export function collectLegacyKeys(): Record<string, string> {
  const keys: Record<string, string> = {};
  if (typeof localStorage === "undefined") return keys;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(PREFIX)) keys[k] = localStorage.getItem(k) ?? "";
  }
  return keys;
}

/** How many real records the browser still holds (0 = nothing worth migrating). */
export function legacySummary(): { total: number; parts: Record<string, number> } {
  const keys = collectLegacyKeys();
  const parts: Record<string, number> = {};
  let total = 0;
  for (const name of DATA_KEYS) {
    const raw = keys[`${PREFIX}${name}:v1`];
    if (!raw) continue;
    try {
      const v = JSON.parse(raw);
      const n = Array.isArray(v) ? v.length : v && typeof v === "object" ? Object.keys(v).length : 0;
      if (n > 0) {
        parts[name] = n;
        if (Array.isArray(v)) total += n;
      }
    } catch {
      /* ignore unreadable entries */
    }
  }
  return { total, parts };
}

export function clearLegacyKeys() {
  if (typeof localStorage === "undefined") return;
  const remove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(PREFIX)) remove.push(k);
  }
  remove.forEach((k) => localStorage.removeItem(k));
}
