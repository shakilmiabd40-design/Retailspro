import { requireAuth } from "@/server/auth";
import { canRead, COLLECTION_ACCESS } from "@/server/collections";
import { query } from "@/server/db";
import { json, route } from "@/server/http";
import { RevisionCache, revisionKey } from "@/server/revision-cache";

export const dynamic = "force-dynamic";
const courierCache = new RevisionCache<string[]>(2);

export const GET = route(async (req) => {
  const auth = await requireAuth(req, { passive: true });
  if (!canRead(auth.role, COLLECTION_ACCESS.orders)) return json({ couriers: [] });
  const revision = await revisionKey(["orders"]);
  const couriers = await courierCache.get(revision, async () => {
    const { rows } = await query<{ company: string }>(
      `select distinct data #>> '{courier,company}' as company
         from app_records
        where collection='orders' and coalesce(trim(data #>> '{courier,company}'), '') <> ''
        order by company`,
    );
    return rows.map((row) => row.company);
  });
  return json({ couriers });
});
