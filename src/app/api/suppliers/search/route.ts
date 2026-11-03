import { canRead, COLLECTION_ACCESS } from "@/server/collections";
import { requireAuth } from "@/server/auth";
import { query } from "@/server/db";
import { json, route } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const auth = await requireAuth(req, { passive: true });
  if (!canRead(auth.role, COLLECTION_ACCESS.suppliers)) {
    return json({ suppliers: [] });
  }
  const value = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 80);
  if (value.length < 2) return json({ suppliers: [] });
  const pattern = `%${value.toLowerCase().replace(/[\\%_]/g, "\\$&")}%`;
  const { rows } = await query<{ id: string; name: string; email: string | null }>(
    `select id, data->>'name' as name, data->>'email' as email
       from app_records
      where collection = 'suppliers'
        and coalesce((data->>'archived')::boolean, false) = false
        and lower(coalesce(data->>'name', '')) like $1 escape chr(92)
      order by lower(data->>'name') asc
      limit 50`,
    [pattern],
  );
  return json({ suppliers: rows });
});
