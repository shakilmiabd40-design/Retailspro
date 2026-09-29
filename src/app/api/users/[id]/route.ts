import { query, tx } from "@/server/db";
import { ApiError, json, readJson, route, str } from "@/server/http";
import { requireAuth } from "@/server/auth";
import { writeAudit } from "@/server/audit";
import { SUPER_ADMIN_ROLE_ID, toUser, USER_SELECT, type UserRow } from "@/server/users";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

async function activeAdminsExcluding(id: string) {
  const { rows } = await query<{ n: string }>("select count(*)::text as n from app_users where role_id = $1 and status = 'active' and id <> $2", [SUPER_ADMIN_ROLE_ID, id]);
  return Number(rows[0].n);
}

export const PATCH = route<Ctx>(async (req, { params }) => {
  const auth = await requireAuth(req, { anyOf: [["settings", "settings"]] });
  const { id } = await params;
  const b = await readJson<{ name?: string; email?: string; phone?: string; roleId?: string; status?: string; notes?: string; mustResetPassword?: boolean }>(req);

  const before = await query<UserRow>(`${USER_SELECT} where u.id = $1`, [id]);
  const prev = before.rows[0];
  if (!prev) throw new ApiError(404, "not_found", "User not found.");

  const name = str(b.name, 120);
  const email = str(b.email, 200);
  const roleId = str(b.roleId, 100);
  const status = b.status === "blocked" ? "blocked" : "active";
  if (!name) throw new ApiError(400, "invalid", "Name is required.");
  if (!email) throw new ApiError(400, "invalid", "Email / username is required.");

  const role = await query<{ name: string }>("select name from app_roles where id = $1", [roleId]);
  if (!role.rows[0]) throw new ApiError(400, "invalid", "Choose a role.");
  const dupe = await query("select 1 from app_users where lower(email) = lower($1) and id <> $2", [email, id]);
  if (dupe.rows.length) throw new ApiError(409, "duplicate", "That email / username is already used by another user.");
  if (id === auth.user.id && status === "blocked") throw new ApiError(400, "invalid", "You can't block your own account.");
  if (prev.role_id === SUPER_ADMIN_ROLE_ID && (roleId !== SUPER_ADMIN_ROLE_ID || status !== "active") && (await activeAdminsExcluding(id)) === 0) {
    throw new ApiError(400, "last_admin", "There must be at least one active Super Admin.");
  }

  await tx(async (client) => {
    await client.query(
      `update app_users set name=$2, email=$3, phone=$4, role_id=$5, status=$6, notes=$7, must_reset_password=$8 where id=$1`,
      [id, name, email, str(b.phone, 40), roleId, status, str(b.notes, 1000) || null, b.mustResetPassword === true]
    );
    if (status === "blocked") await client.query("delete from app_sessions where user_id = $1", [id]);
  });

  const prevRole = await query<{ name: string }>("select name from app_roles where id = $1", [prev.role_id]);
  await writeAudit(req, {
    userId: auth.user.id,
    userName: auth.user.name,
    module: "Users & Roles",
    action: "edit",
    entity: `User ${name}`,
    summary: `Updated user ${name}`,
    before: { name: prev.name, email: prev.email, phone: prev.phone, role: prevRole.rows[0]?.name, status: prev.status },
    after: { name, email, phone: str(b.phone, 40), role: role.rows[0].name, status },
  });
  const { rows } = await query<UserRow>(`${USER_SELECT} where u.id = $1`, [id]);
  return json({ user: toUser(rows[0]) });
});

export const DELETE = route<Ctx>(async (req, { params }) => {
  const auth = await requireAuth(req, { anyOf: [["settings", "settings"]] });
  const { id } = await params;
  const { rows } = await query<UserRow>(`${USER_SELECT} where u.id = $1`, [id]);
  const user = rows[0];
  if (!user) throw new ApiError(404, "not_found", "User not found.");
  if (id === auth.user.id) throw new ApiError(400, "invalid", "You can't delete your own account.");
  if (user.has_history) throw new ApiError(409, "has_history", `${user.name} has activity history — deactivate instead of deleting so past records keep their author.`);
  if (user.role_id === SUPER_ADMIN_ROLE_ID && (await activeAdminsExcluding(id)) === 0) throw new ApiError(400, "last_admin", "There must be at least one active Super Admin.");
  await query("delete from app_users where id = $1", [id]);
  await writeAudit(req, { userId: auth.user.id, userName: auth.user.name, module: "Users & Roles", action: "delete", entity: `User ${user.name}`, summary: `Deleted user ${user.name}`, before: { email: user.email } });
  return json({ ok: true });
});
