import "server-only";
import type { AppUser } from "@/lib/settings/types";
import { SUPER_ADMIN_ROLE_ID } from "@/lib/settings/permissions";

export interface UserRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  role_id: string;
  status: "active" | "blocked";
  must_reset_password: boolean;
  last_login: Date | null;
  notes: string | null;
  created_at: Date;
  has_history: boolean;
}

export const USER_SELECT = `
  select u.id, u.name, u.email, u.phone, u.role_id, u.status, u.must_reset_password, u.last_login, u.notes, u.created_at,
         (u.last_login is not null or exists (select 1 from app_audit_log a where a.user_id = u.id)) as has_history
    from app_users u`;

export function toUser(r: UserRow): AppUser {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    roleId: r.role_id,
    status: r.status,
    lastLogin: r.last_login?.toISOString(),
    notes: r.notes ?? undefined,
    mustResetPassword: r.must_reset_password,
    createdAt: r.created_at.toISOString(),
    hasHistory: r.has_history,
  };
}

export { SUPER_ADMIN_ROLE_ID };
