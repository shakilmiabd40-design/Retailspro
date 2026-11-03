import { query } from "@/server/db";
import { ApiError, json, route } from "@/server/http";
import { requireAuth } from "@/server/auth";
import { canRead, COLLECTION_ACCESS, DOCUMENT_ACCESS, isCollection, isDocument, type CollectionName, type DocumentKey } from "@/server/collections";
import { canSeeProductCost, redactProductCost, redactSteadfastSecrets } from "@/server/redact";

export const dynamic = "force-dynamic";

const names = (v: string | null) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : []);

/** Batched read: ?c=products,orders&d=settings,catalog */
export const GET = route(async (req) => {
  const passive = req.headers.get("x-rp-passive") === "1";
  const auth = await requireAuth(req, { passive });
  const cs = names(req.nextUrl.searchParams.get("c")) as CollectionName[];
  const ds = names(req.nextUrl.searchParams.get("d")) as DocumentKey[];
  if (cs.length + ds.length > 30) throw new ApiError(400, "too_many", "Too many names requested.");

  const all = [...cs, ...ds];
  // Validate names before querying so a bad request can't make the database scan arbitrary
  // collection names. Keep access filtering below, before returning any collection rows.
  for (const name of cs) if (!isCollection(name)) throw new ApiError(400, "unknown_collection", `Unknown collection: ${name}`);
  for (const key of ds) if (!isDocument(key)) throw new ApiError(400, "unknown_document", `Unknown document: ${key}`);

  const { rows: revRows } = await query<{ name: string; rev: string }>("select name, rev::text from app_revs where name = any($1::text[])", [all]);
  const revs = Object.fromEntries(revRows.map((r) => [r.name, Number(r.rev)]));

  const collections: Record<string, unknown> = {};
  const readable = cs.filter((name): name is keyof typeof COLLECTION_ACCESS => canRead(auth.role, COLLECTION_ACCESS[name as keyof typeof COLLECTION_ACCESS]));
  for (const name of cs) {
    if (!readable.includes(name)) collections[name] = { forbidden: true };
  }
  // Fetch all requested collections in one database round trip instead of issuing one query
  // per collection. The global order does not change the newest-first order within each list.
  if (readable.length) {
    const { rows } = await query<{ collection: string; id: string; data: unknown; version: number }>(
      "select collection, id, data, version from app_records where collection = any($1::text[]) order by collection, seq desc",
      [readable],
    );
    const grouped = new Map<string, { id: string; data: unknown; version: number }[]>();
    for (const row of rows) {
      const list = grouped.get(row.collection) ?? [];
      list.push({ id: row.id, data: row.data, version: row.version });
      grouped.set(row.collection, list);
    }
    for (const name of readable) {
      const collectionRows = grouped.get(name) ?? [];
      // Cost price is a field-level permission: strip it for roles without products:financial (the sync write
      // path preserves the stored cost, so this can never corrupt it).
      const outRows = name === "products" && !canSeeProductCost(auth.role) ? collectionRows.map((r) => ({ ...r, data: redactProductCost(r.data) })) : collectionRows;
      collections[name] = { rev: revs[name] ?? 0, rows: outRows };
    }
  }

  const documents: Record<string, unknown> = {};
  const readableDocs = ds.filter((key): key is keyof typeof DOCUMENT_ACCESS => canRead(auth.role, DOCUMENT_ACCESS[key as keyof typeof DOCUMENT_ACCESS]));
  for (const key of ds) if (!readableDocs.includes(key)) documents[key] = { forbidden: true };
  if (readableDocs.length) {
    const { rows } = await query<{ key: string; data: unknown; version: number }>(
      "select key, data, version from app_documents where key = any($1::text[])",
      [readableDocs],
    );
    const byKey = new Map(rows.map((row) => [row.key, row]));
    for (const key of readableDocs) {
      const row = byKey.get(key);
      // The Steadfast API key/secret live in the settings document but must never leave the server —
      // every signed-in role can read settings, so they're masked here (the write path keeps the stored value).
      const data = row?.data ?? null;
      documents[key] = { rev: revs[key] ?? 0, data: key === "settings" ? redactSteadfastSecrets(data) : data, version: row?.version ?? 0 };
    }
  }

  return json({ collections, documents });
});
