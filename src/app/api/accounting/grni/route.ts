import type { GrniEntry } from "@/lib/accounting/gl-types";
import { canRead, COLLECTION_ACCESS } from "@/server/collections";
import { requireAuth } from "@/server/auth";
import { query } from "@/server/db";
import { ApiError, json, route } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const auth = await requireAuth(req, { passive: true });
  if (!canRead(auth.role, COLLECTION_ACCESS.grni)) throw new ApiError(403, "forbidden", "You do not have access to GRNI reports.");
  const { rows } = await query<{ data: GrniEntry }>(
    "select data from app_records where collection='grni' and data->>'status' not in ('closed','invoiced') order by data->>'receivedAt' asc,seq asc",
  );
  return json({ rows: rows.map((row) => row.data) });
});
