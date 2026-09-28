import "server-only";
import type { ActionKey, ModuleKey, PermissionMap, Role } from "@/lib/settings/types";
import { MODULES } from "@/lib/settings/permissions";

export interface RoleRow {
  id: string;
  name: string;
  description: string;
  built_in: boolean;
  locked: boolean;
  permissions: PermissionMap;
  created_at: Date;
}

export function roleFromRow(r: RoleRow): Role {
  return { id: r.id, name: r.name, description: r.description, builtIn: r.built_in, locked: r.locked || undefined, permissions: r.permissions, createdAt: r.created_at.toISOString() };
}

/** Keeps only real modules / actions, so a crafted request can't store junk in a role. */
export function cleanPermissions(input: unknown): PermissionMap {
  const out: PermissionMap = {};
  if (typeof input !== "object" || input === null) return out;
  for (const m of MODULES) {
    const raw = (input as Record<string, unknown>)[m.key];
    if (!Array.isArray(raw)) continue;
    const actions = m.actions.filter((a) => raw.includes(a)) as ActionKey[];
    if (actions.length) out[m.key as ModuleKey] = actions;
  }
  return out;
}
