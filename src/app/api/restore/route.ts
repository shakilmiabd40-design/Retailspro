import { tx } from "@/server/db";
import { json, readJson, route } from "@/server/http";
import { requireAuth } from "@/server/auth";
import { writeAudit } from "@/server/audit";
import { parseBackup, restoreBackup } from "@/server/backup";

export const dynamic = "force-dynamic";

/** Super Admin: replace every product, order, supplier… with the contents of a backup file. */
export const POST = route(async (req) => {
  const auth = await requireAuth(req, { superAdmin: true });
  const backup = parseBackup(await readJson(req));
  await tx((client) => restoreBackup(client, backup, auth.user.id));
  await writeAudit(req, { userId: auth.user.id, userName: auth.user.name, module: "Data", action: "import", entity: "Full backup", summary: `Restored backup from ${backup.exportedAt || "unknown date"}` });
  return json({ ok: true });
});
