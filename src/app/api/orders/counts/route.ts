import { query } from "@/server/db";
import { json, route } from "@/server/http";
import { requireAuth } from "@/server/auth";
import { canRead, COLLECTION_ACCESS } from "@/server/collections";
import { RevisionCache, revisionKey } from "@/server/revision-cache";

export const dynamic = "force-dynamic";

type Counts = Record<string, number>;
const countsCache = new RevisionCache<Counts>(2);
const STATUSES = ["pending", "processing", "in_transit", "delivered", "partial_delivered", "refuse_return", "cancelled"] as const;

export const GET = route(async (req) => {
  const auth = await requireAuth(req, { passive: true });
  if (!canRead(auth.role, COLLECTION_ACCESS.orders)) return json({ counts: {} });
  const rev = await revisionKey(["orders"]);
  const counts = await countsCache.get(rev, async () => {
    const { rows } = await query<Record<string, string>>(
      `select count(*)::text as total,
        ${STATUSES.map((status) => `count(*) filter (where data->>'status'='${status}')::text as "${status}"`).join(",\n        ")}
       from app_records where collection='orders'`,
    );
    return Object.fromEntries(Object.entries(rows[0] ?? {}).map(([key, value]) => [key, Number(value)]));
  });
  return json({ counts });
});
