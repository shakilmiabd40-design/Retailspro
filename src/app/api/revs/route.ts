import { query } from "@/server/db";
import { json, route } from "@/server/http";
import { requireAuth } from "@/server/auth";

export const dynamic = "force-dynamic";

const cache = new Map<string, { revs: Record<string, number>; exp: number }>();
const TTL = 2000;

export const GET = route(async (req) => {
  await requireAuth(req, { passive: true });
  const n = (req.nextUrl.searchParams.get("n") ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 40);
  const key = n.slice().sort().join(",");
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.exp > now) {
    return json({ revs: cached.revs });
  }
  const { rows } = await query<{ name: string; rev: string }>("select name, rev::text from app_revs where name = any($1::text[])", [n]);
  const revs = Object.fromEntries(rows.map((r) => [r.name, Number(r.rev)]));
  cache.set(key, { revs, exp: now + TTL });
  return json({ revs });
});
