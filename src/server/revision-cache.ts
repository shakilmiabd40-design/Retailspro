import "server-only";
import { query } from "@/server/db";

/** A small per-process cache for read models whose inputs are versioned by app_revs. */
export class RevisionCache<T> {
  private values = new Map<string, Promise<T>>();

  constructor(private readonly maxEntries = 24) {}

  delete(key: string) {
    this.values.delete(key);
  }

  get(key: string, load: () => Promise<T>): Promise<T> {
    const cached = this.values.get(key);
    if (cached) return cached;
    const value = load();
    this.values.set(key, value);
    while (this.values.size > this.maxEntries) {
      const oldest = this.values.keys().next().value;
      if (oldest === undefined) break;
      this.values.delete(oldest);
    }
    value.catch(() => {
      if (this.values.get(key) === value) this.values.delete(key);
    });
    return value;
  }
}

/** Build a stable cache key from collection/document revisions, defaulting untouched names to 0. */
export async function revisionKey(names: string[]): Promise<string> {
  const unique = [...new Set(names)].sort();
  const { rows } = await query<{ name: string; rev: string }>(
    "select name, rev::text from app_revs where name = any($1::text[])",
    [unique],
  );
  const revisions = new Map(rows.map((row) => [row.name, row.rev]));
  return unique.map((name) => `${name}:${revisions.get(name) ?? "0"}`).join("|");
}
