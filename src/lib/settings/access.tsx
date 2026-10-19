"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ActionKey, AppUser, ModuleKey, PermissionMap, Role } from "./types";
import { SUPER_ADMIN_ROLE_ID } from "./permissions";
import { applyRuntime } from "./runtime";
import { api, HttpError } from "@/lib/persist/api";
import { useAuth } from "@/lib/auth/context";

export type UserInput = {
  name: string;
  email: string;
  phone: string;
  roleId: string;
  status: AppUser["status"];
  notes?: string;
  mustResetPassword: boolean;
};

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
type RoleInput = { name: string; description: string; permissions: PermissionMap };

interface AccessContextValue {
  /** Empty unless you have "Settings access" (only then does the server share the user list). */
  users: AppUser[];
  roles: Role[];
  currentUser: AppUser;
  currentRole: Role;
  isSuperAdmin: boolean;
  hydrated: boolean;
  can: (module: ModuleKey, action?: ActionKey) => boolean;
  roleOf: (user: AppUser) => Role | undefined;
  addUser: (input: UserInput) => Promise<Result<{ user: AppUser; tempPassword: string }>>;
  updateUser: (id: string, input: UserInput) => Promise<Result>;
  setUserStatus: (id: string, status: AppUser["status"]) => Promise<Result>;
  resetPassword: (id: string) => Promise<Result<{ tempPassword: string }>>;
  deleteUser: (id: string) => Promise<Result>;
  addRole: (input: RoleInput) => Promise<Result<{ role: Role }>>;
  updateRole: (id: string, input: RoleInput) => Promise<Result>;
  deleteRole: (id: string) => Promise<Result>;
}

const AccessContext = createContext<AccessContextValue | null>(null);

const fail = (err: unknown): { ok: false; error: string } => ({ ok: false, error: err instanceof HttpError ? err.message : "Something went wrong. Please try again." });

export function AccessProvider({ children }: { children: ReactNode }) {
  const { user: me } = useAuth();
  const [roles, setRoles] = useState<Role[]>([me.role]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [rolesReady, setRolesReady] = useState(false);
  const [usersReady, setUsersReady] = useState(false);

  const currentRole = me.role;
  const isSuperAdmin = currentRole.locked === true || currentRole.id === SUPER_ADMIN_ROLE_ID;
  const canManageUsers = isSuperAdmin || !!currentRole.permissions.settings?.includes("settings");

  const currentUser: AppUser = useMemo(
    () => ({ id: me.id, name: me.name, email: me.email, phone: me.phone, roleId: me.roleId, status: me.status, mustResetPassword: me.mustResetPassword, lastLogin: me.lastLogin ?? undefined, createdAt: "" }),
    [me]
  );

  // Stamp who is acting onto activity entries (idempotent, written during render like the settings runtime).
  applyRuntime({ actor: { id: me.id, name: me.name } });

  const loadRoles = useCallback(async () => {
    try {
      const res = await api<{ roles: Role[] }>("GET", "/api/roles");
      setRoles(res.roles);
    } catch {
      /* keep own role */
    } finally {
      setRolesReady(true);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    if (!canManageUsers) {
      setUsersReady(true);
      return;
    }
    try {
      const res = await api<{ users: AppUser[] }>("GET", "/api/users");
      setUsers(res.users);
    } catch {
      /* keep what we have */
    } finally {
      setUsersReady(true);
    }
  }, [canManageUsers]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    void loadRoles();
  }, [loadRoles]);
  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const can = useCallback((module: ModuleKey, action: ActionKey = "view") => isSuperAdmin || !!currentRole.permissions[module]?.includes(action), [isSuperAdmin, currentRole]);
  const roleOf = useCallback((u: AppUser) => roles.find((r) => r.id === u.roleId), [roles]);

  const addUser: AccessContextValue["addUser"] = async (input) => {
    try {
      const res = await api<{ user: AppUser; tempPassword: string }>("POST", "/api/users", input);
      await loadUsers();
      return { ok: true, user: res.user, tempPassword: res.tempPassword };
    } catch (e) {
      return fail(e);
    }
  };
  const updateUser: AccessContextValue["updateUser"] = async (id, input) => {
    try {
      await api("PATCH", `/api/users/${id}`, input);
      await loadUsers();
      return { ok: true };
    } catch (e) {
      return fail(e);
    }
  };
  const setUserStatus: AccessContextValue["setUserStatus"] = async (id, status) => {
    try {
      await api("POST", `/api/users/${id}/status`, { status });
      await loadUsers();
      return { ok: true };
    } catch (e) {
      return fail(e);
    }
  };
  const resetPassword: AccessContextValue["resetPassword"] = async (id) => {
    try {
      const res = await api<{ tempPassword: string }>("POST", `/api/users/${id}/reset-password`);
      await loadUsers();
      return { ok: true, tempPassword: res.tempPassword };
    } catch (e) {
      return fail(e);
    }
  };
  const deleteUser: AccessContextValue["deleteUser"] = async (id) => {
    try {
      await api("DELETE", `/api/users/${id}`);
      await loadUsers();
      return { ok: true };
    } catch (e) {
      return fail(e);
    }
  };
  const addRole: AccessContextValue["addRole"] = async (input) => {
    try {
      const res = await api<{ role: Role }>("POST", "/api/roles", input);
      await loadRoles();
      return { ok: true, role: res.role };
    } catch (e) {
      return fail(e);
    }
  };
  const updateRole: AccessContextValue["updateRole"] = async (id, input) => {
    try {
      await api("PATCH", `/api/roles/${id}`, input);
      await loadRoles();
      return { ok: true };
    } catch (e) {
      return fail(e);
    }
  };
  const deleteRole: AccessContextValue["deleteRole"] = async (id) => {
    try {
      await api("DELETE", `/api/roles/${id}`);
      await loadRoles();
      return { ok: true };
    } catch (e) {
      return fail(e);
    }
  };

  const value: AccessContextValue = {
    users,
    roles,
    currentUser,
    currentRole,
    isSuperAdmin,
    hydrated: rolesReady && usersReady,
    can,
    roleOf,
    addUser,
    updateUser,
    setUserStatus,
    resetPassword,
    deleteUser,
    addRole,
    updateRole,
    deleteRole,
  };

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

export function useAccess() {
  const ctx = useContext(AccessContext);
  if (!ctx) throw new Error("useAccess must be used within an AccessProvider");
  return ctx;
}
