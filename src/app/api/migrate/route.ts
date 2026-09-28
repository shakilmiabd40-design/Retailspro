import { query, tx } from "@/server/db";
import { ApiError, json, readJson, route } from "@/server/http";
import { requireAuth } from "@/server/auth";
import { writeAudit } from "@/server/audit";
import { legacyToBackup, restoreBackup } from "@/server/backup";

export const dynamic = "force-dynamic";

/** Super Admin: move data that used to live in this browser's localStorage into the database. */
export const POST = route(async (req) => {
  const auth = await requireAuth(req, { superAdmin: true });
  const body = await readJson<{ keys?: Record<string, string>; replace?: boolean }>(req);
  if (!body.keys || typeof body.keys !== "object") throw new ApiError(400, "invalid", "No browser data supplied.");
  const keys: Record<string, string> = {};
  for (const [k, v] of Object.entries(body.keys)) if (k.startsWith("retailpro:") && typeof v === "string") keys[k] = v;

  const backup = legacyToBackup(keys);
  const found = Object.keys(backup.collections).length + Object.keys(backup.documents).length;
  if (!found) throw new ApiError(400, "nothing_to_import", "This browser has no RetailPro data to import.");

  const existing = await query<{ n: string }>("select count(*)::text as n from app_records");
  if (Number(existing.rows[0].n) > 0 && !body.replace) {
    throw new ApiError(409, "not_empty", "The database already contains data. Confirm to replace it with this browser's data.");
  }
  await tx((client) => restoreBackup(client, backup, auth.user.id));
  const counts = Object.fromEntries(Object.entries(backup.collections).map(([k, v]) => [k, v?.length ?? 0]));
  await writeAudit(req, { userId: auth.user.id, userName: auth.user.name, module: "Data", action: "import", entity: "Browser data", summary: "Moved this browser's saved data into the database", after: counts });
  return json({ ok: true, counts });
});
