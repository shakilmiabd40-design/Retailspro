import { json, route } from "@/server/http";
import { requireAuth } from "@/server/auth";
import { writeAudit } from "@/server/audit";
import { buildBackup } from "@/server/backup";
import { getShopName } from "@/server/shop";
import { shopSlug } from "@/lib/settings/shop";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const auth = await requireAuth(req, { superAdmin: true });
  const [backup, shopName] = await Promise.all([buildBackup(), getShopName()]);
  await writeAudit(req, { userId: auth.user.id, userName: auth.user.name, module: "Data", action: "export", entity: "Full backup", summary: "Downloaded a full backup" });
  return json(backup, { headers: { "Content-Disposition": `attachment; filename="${shopSlug(shopName)}-backup-${new Date().toISOString().slice(0, 10)}.json"` } });
});
