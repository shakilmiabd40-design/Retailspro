import { query, tx } from "@/server/db";
import { ApiError, json, readJson, route } from "@/server/http";
import { requireAuth } from "@/server/auth";
import { writeAudit } from "@/server/audit";
import { SUPER_ADMIN_ROLE_ID, toUser, USER_SELECT, type UserRow } from "@/server/users";

export const dynamic = "force-dynamic";

export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const auth = await requireAuth(req, { anyOf: [["settings", "settings"]] });
  const { id } = await params;
  const { status } = await readJson<{ status?: string }>(req);
  if (status !== "active" && status !== "blocked") throw new ApiError(400, "invalid", "Bad status.");

  const { rows } = await query<UserRow>(`${USER_SELECT} where u.id = $1`, [id]);
  const user = rows[0];
  if (!user) throw new ApiError(404, "not_found", "User not found.");
  if (status === "blocked") {
    if (id === auth.user.id) throw new ApiError(400, "invalid", "You can't deactivate your own account.");
    if (user.role_id === SUPER_ADMIN_ROLE_ID) {
      const n = await query<{ n: string }>("select count(*)::text as n from app_users where role_id = $1 and status = 'active' and id <> $2", [SUPER_ADMIN_ROLE_ID, id]);
      if (Number(n.rows[0].n) === 0) throw new ApiError(400, "last_admin", "There must be at least one active Super Admin.");
    }
  }
  await tx(async (client) => {
    await client.query("update app_users set status = $2 where id = $1", [id, status]);
    if (status === "blocked") await client.query("delete from app_sessions where user_id = $1", [id]);
  });
  await writeAudit(req, { userId: auth.user.id, userName: auth.user.name, module: "Users & Roles", action: "status_change", entity: `User ${user.name}`, summary: `${status === "blocked" ? "Deactivated" : "Reactivated"} ${user.name}`, before: { status: user.status }, after: { status } });
  const after = await query<UserRow>(`${USER_SELECT} where u.id = $1`, [id]);
  return json({ user: toUser(after.rows[0]) });
});
