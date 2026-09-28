import { query } from "@/server/db";
import { ApiError, json, readJson, route, str } from "@/server/http";
import { requireAuth } from "@/server/auth";
import { writeAudit } from "@/server/audit";
import { cleanPermissions, type RoleRow } from "@/server/roles";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route<Ctx>(async (req, { params }) => {
  const auth = await requireAuth(req, { anyOf: [["settings", "settings"]] });
  const { id } = await params;
  const b = await readJson<{ name?: string; description?: string; permissions?: unknown }>(req);
  const prev = (await query<RoleRow>("select * from app_roles where id = $1", [id])).rows[0];
  if (!prev) throw new ApiError(404, "not_found", "Role not found.");
  if (prev.locked) throw new ApiError(400, "locked", "Super Admin always has full access and can't be edited.");
  const name = str(b.name, 80);
  if (!name) throw new ApiError(400, "invalid", "Role name is required.");
  const dupe = await query("select 1 from app_roles where lower(name) = lower($1) and id <> $2", [name, id]);
  if (dupe.rows.length) throw new ApiError(409, "duplicate", "A role with that name already exists.");
  const permissions = cleanPermissions(b.permissions);
  await query("update app_roles set name = $2, description = $3, permissions = $4::jsonb where id = $1", [id, name, str(b.description, 500), JSON.stringify(permissions)]);
  await writeAudit(req, { userId: auth.user.id, userName: auth.user.name, module: "Users & Roles", action: "edit", entity: `Role ${name}`, summary: `Updated role ${name}`, before: prev.permissions, after: permissions });
  return json({ ok: true });
});

export const DELETE = route<Ctx>(async (req, { params }) => {
  const auth = await requireAuth(req, { anyOf: [["settings", "settings"]] });
  const { id } = await params;
  const role = (await query<RoleRow>("select * from app_roles where id = $1", [id])).rows[0];
  if (!role) throw new ApiError(404, "not_found", "Role not found.");
  if (role.built_in) throw new ApiError(400, "built_in", "Built-in roles can't be deleted.");
  const inUse = Number((await query<{ n: string }>("select count(*)::text as n from app_users where role_id = $1", [id])).rows[0].n);
  if (inUse) throw new ApiError(409, "in_use", `${inUse} user${inUse > 1 ? "s use" : " uses"} this role — reassign ${inUse > 1 ? "them" : "that user"} first.`);
  await query("delete from app_roles where id = $1", [id]);
  await writeAudit(req, { userId: auth.user.id, userName: auth.user.name, module: "Users & Roles", action: "delete", entity: `Role ${role.name}`, summary: `Deleted role ${role.name}` });
  return json({ ok: true });
});
