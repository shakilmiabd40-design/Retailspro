import { query } from "@/server/db";
import { json, route } from "@/server/http";
import { requireAuth } from "@/server/auth";

export const dynamic = "force-dynamic";

/** Cheap "did anything change?" poll. Passive: doesn't keep an idle session alive. */
export const GET = route(async (req) => {
  await requireAuth(req, { passive: true });
  const n = (req.nextUrl.searchParams.get("n") ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 40);
  const { rows } = await query<{ name: string; rev: string }>("select name, rev::text from app_revs where name = any($1::text[])", [n]);
  return json({ revs: Object.fromEntries(rows.map((r) => [r.name, Number(r.rev)])) });
});
