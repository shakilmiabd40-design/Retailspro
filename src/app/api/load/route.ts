import { query } from "@/server/db";
import { ApiError, json, route } from "@/server/http";
import { requireAuth } from "@/server/auth";
import { canRead, COLLECTION_ACCESS, DOCUMENT_ACCESS, isCollection, isDocument } from "@/server/collections";

export const dynamic = "force-dynamic";

const names = (v: string | null) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : []);

/** Batched read: ?c=products,orders&d=settings,catalog */
export const GET = route(async (req) => {
  const passive = req.headers.get("x-rp-passive") === "1";
  const auth = await requireAuth(req, { passive });
  const cs = names(req.nextUrl.searchParams.get("c"));
  const ds = names(req.nextUrl.searchParams.get("d"));
  if (cs.length + ds.length > 30) throw new ApiError(400, "too_many", "Too many names requested.");

  const all = [...cs, ...ds];
  const { rows: revRows } = await query<{ name: string; rev: string }>("select name, rev::text from app_revs where name = any($1::text[])", [all]);
  const revs = Object.fromEntries(revRows.map((r) => [r.name, Number(r.rev)]));

  const collections: Record<string, unknown> = {};
  for (const name of cs) {
    if (!isCollection(name)) throw new ApiError(400, "unknown_collection", `Unknown collection: ${name}`);
    if (!canRead(auth.role, COLLECTION_ACCESS[name])) {
      collections[name] = { forbidden: true };
      continue;
    }
    const { rows } = await query("select id, data, version from app_records where collection = $1 order by seq desc", [name]);
    collections[name] = { rev: revs[name] ?? 0, rows };
  }

  const documents: Record<string, unknown> = {};
  for (const key of ds) {
    if (!isDocument(key)) throw new ApiError(400, "unknown_document", `Unknown document: ${key}`);
    if (!canRead(auth.role, DOCUMENT_ACCESS[key])) {
      documents[key] = { forbidden: true };
      continue;
    }
    const { rows } = await query<{ data: unknown; version: number }>("select data, version from app_documents where key = $1", [key]);
    documents[key] = { rev: revs[key] ?? 0, data: rows[0]?.data ?? null, version: rows[0]?.version ?? 0 };
  }

  return json({ collections, documents });
});
