"use client";

import { useMemo, useState } from "react";
import { Ban, Check, Copy, Eye, KeyRound, Pencil, Plus, Search, Trash2, UserCheck } from "lucide-react";
import { useAccess, type UserInput } from "@/lib/settings/access";
import { useSettings } from "@/lib/settings/store";
import { useAuditFeed } from "@/lib/settings/audit-feed";
import { formatDateTime } from "@/lib/settings/runtime";
import { countPermissions, TOTAL_PERMISSIONS } from "@/lib/settings/permissions";
import type { AppUser } from "@/lib/settings/types";
import { initialsOf } from "@/lib/settings/utils";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { UsersTabs } from "@/components/settings/users-tabs";
import { EmptyRow, Field, GhostButton, Modal, PageHeader, PrimaryButton, SelectInput, SettingsGate, Tag, TextArea, TextInput, ToggleRow } from "@/components/settings/ui";

type Credentials = { name: string; tempPassword: string; created?: boolean };

function CopyRow({ label, value }: { label: string; value: string }) {
  const showToast = useToast();
  return (
    <div>
      <p className="mb-1 text-[12px] font-medium" style={{ color: "var(--text-muted)" }}>
        {label}
      </p>
      <div className="flex items-center gap-2 rounded-xl border px-3 py-2" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
        <code className="min-w-0 flex-1 break-all text-[12.5px]" style={{ color: "var(--text)" }}>
          {value}
        </code>
        <button
          type="button"
          onClick={() => navigator.clipboard?.writeText(value).then(() => showToast("Copied"), () => showToast("Couldn't copy", "error"))}
          aria-label={`Copy ${label}`}
          className="focus-ring rounded-md p-1.5"
          style={{ color: "var(--text-muted)" }}
        >
          <Copy size={15} />
        </button>
      </div>
    </div>
  );
}

function UserFormModal({ user, onClose, onDone }: { user: AppUser | null; onClose: () => void; onDone: (c?: Credentials) => void }) {
  const { roles, addUser, updateUser } = useAccess();
  const { settings } = useSettings();
  const showToast = useToast();
  const [form, setForm] = useState<UserInput>({
    name: user?.name ?? "",
    email: user?.email ?? "",
    phone: user?.phone ?? "",
    roleId: user?.roleId ?? roles.find((r) => r.id === "role-sales")?.id ?? roles[0].id,
    status: user?.status ?? "active",
    notes: user?.notes ?? "",
    mustResetPassword: user?.mustResetPassword ?? settings.security.forceResetOnFirstLogin,
  });
  const set = <K extends keyof UserInput>(k: K, v: UserInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    if (user) {
      const res = await updateUser(user.id, form);
      if (!res.ok) return showToast(res.error, "error");
      showToast("User updated");
      onDone();
    } else {
      const res = await addUser(form);
      if (!res.ok) return showToast(res.error, "error");
      showToast("User created");
      onDone({ name: res.user.name, tempPassword: res.tempPassword, created: true });
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={user ? `Edit ${user.name}` : "Add user"}
      footer={
        <>
          <GhostButton onClick={onClose}>Cancel</GhostButton>
          <PrimaryButton onClick={submit}>{user ? "Save changes" : "Create user"}</PrimaryButton>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Name" required>
          <TextInput value={form.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="Email / username" required hint="Must be unique.">
          <TextInput value={form.email} onChange={(e) => set("email", e.target.value)} />
        </Field>
        <Field label="Phone">
          <TextInput value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="01XXXXXXXXX" />
        </Field>
        <Field label="Role" required>
          <SelectInput value={form.roleId} onChange={(v) => set("roleId", v)} options={roles.map((r) => ({ value: r.id, label: r.name }))} />
        </Field>
        <Field label="Status">
          <SelectInput value={form.status} onChange={(v) => set("status", v)} options={[{ value: "active", label: "Active" }, { value: "blocked", label: "Blocked" }]} />
        </Field>
      </div>
      <Field label="Notes">
        <TextArea rows={2} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
      </Field>
      <div className="rounded-xl border px-4" style={{ borderColor: "var(--border-soft)" }}>
        <ToggleRow
          label="Require password reset at next sign-in"
          description={user ? "Use Reset Password from the users list to issue a new temporary password." : "A temporary password is generated when you save — it's shown once and only its hash is stored."}
          checked={form.mustResetPassword}
          onChange={(v) => set("mustResetPassword", v)}
        />
      </div>
    </Modal>
  );
}

function ViewUserModal({ user, onClose }: { user: AppUser; onClose: () => void }) {
  const { roleOf } = useAccess();
  const { entries } = useAuditFeed();
  const role = roleOf(user);
  const recent = entries.filter((e) => e.userId === user.id || e.userName === user.name).slice(0, 6);
  return (
    <Modal open onClose={onClose} title={user.name} wide footer={<GhostButton onClick={onClose}>Close</GhostButton>}>
      <div className="grid grid-cols-1 gap-x-6 gap-y-3 text-[13px] sm:grid-cols-2">
        {[
          ["Email / username", user.email],
          ["Phone", user.phone || "—"],
          ["Role", role?.name ?? "—"],
          ["Status", user.status === "active" ? "Active" : "Blocked"],
          ["Last login", formatDateTime(user.lastLogin)],
          ["Created", formatDateTime(user.createdAt)],
          ["Permissions", role ? `${role.locked ? TOTAL_PERMISSIONS : countPermissions(role.permissions)} of ${TOTAL_PERMISSIONS}` : "—"],
          ["Password reset pending", user.mustResetPassword ? "Yes" : "No"],
        ].map(([k, v]) => (
          <div key={k}>
            <p className="text-[11.5px]" style={{ color: "var(--text-faint)" }}>
              {k}
            </p>
            <p style={{ color: "var(--text)" }}>{v}</p>
          </div>
        ))}
      </div>
      {user.notes && (
        <p className="rounded-xl px-3.5 py-2.5 text-[12.5px]" style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
          {user.notes}
        </p>
      )}
      <div>
        <p className="mb-2 text-[13px] font-semibold" style={{ color: "var(--text)" }}>
          Recent activity
        </p>
        {recent.length === 0 ? (
          <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
            No recorded activity yet.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {recent.map((e) => (
              <li key={e.id} className="flex justify-between gap-3 text-[12.5px]">
                <span style={{ color: "var(--text)" }}>
                  {e.entity} — {e.summary}
                </span>
                <span className="shrink-0" style={{ color: "var(--text-faint)" }}>
                  {formatDateTime(e.at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

function UsersPanel() {
  const { users, roles, roleOf, currentUser, setUserStatus, resetPassword, deleteUser } = useAccess();
  const showToast = useToast();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editing, setEditing] = useState<AppUser | "new" | null>(null);
  const [viewing, setViewing] = useState<AppUser | null>(null);
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "delete" | "deactivate" | "reset"; user: AppUser } | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== "all" && u.roleId !== roleFilter) return false;
      if (statusFilter !== "all" && u.status !== statusFilter) return false;
      if (!q) return true;
      return [u.name, u.email, u.phone].some((v) => v.toLowerCase().includes(q));
    });
  }, [users, search, roleFilter, statusFilter]);

  async function runConfirm() {
    if (!confirm) return;
    const { kind, user } = confirm;
    setConfirm(null);
    if (kind === "delete") {
      const res = await deleteUser(user.id);
      showToast(res.ok ? "User deleted" : res.error, res.ok ? "success" : "error");
    } else if (kind === "deactivate") {
      const res = await setUserStatus(user.id, "blocked");
      showToast(res.ok ? `${user.name} deactivated` : res.error, res.ok ? "success" : "error");
    } else {
      const res = await resetPassword(user.id);
      if (!res.ok) return showToast(res.error, "error");
      setCredentials({ name: user.name, tempPassword: res.tempPassword });
    }
  }

  const confirmCopy = {
    delete: { title: "Delete user", label: "Delete", danger: true, message: (u: AppUser) => `Permanently delete ${u.name}? Users with activity history can't be deleted — deactivate them instead.` },
    deactivate: { title: "Deactivate user", label: "Deactivate", danger: true, message: (u: AppUser) => `${u.name} will no longer be able to sign in. Their past activity stays on record.` },
    reset: { title: "Reset password", label: "Reset password", danger: false, message: (u: AppUser) => `Issue a new temporary password for ${u.name}? They'll have to choose their own at next sign-in.` },
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="focus-ring flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border px-3 py-2" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <Search size={15} style={{ color: "var(--text-faint)" }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email or phone…" className="w-full bg-transparent text-[13px] outline-none" style={{ color: "var(--text)" }} />
        </label>
        <div className="w-44">
          <SelectInput value={roleFilter} onChange={setRoleFilter} options={[{ value: "all", label: "All roles" }, ...roles.map((r) => ({ value: r.id, label: r.name }))]} />
        </div>
        <div className="w-36">
          <SelectInput value={statusFilter} onChange={setStatusFilter} options={[{ value: "all", label: "All status" }, { value: "active", label: "Active" }, { value: "blocked", label: "Blocked" }]} />
        </div>
        <PrimaryButton onClick={() => setEditing("new")}>
          <Plus size={15} />
          Add user
        </PrimaryButton>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-left text-[13px]">
            <thead>
              <tr className="text-[11.5px]" style={{ color: "var(--text-faint)", background: "var(--surface-2)" }}>
                {["Name", "Username / email", "Phone", "Role", "Status", "Last login", "Actions"].map((h) => (
                  <th key={h} className="px-4 py-2.5 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && <EmptyRow cols={7}>No users match those filters.</EmptyRow>}
              {filtered.map((u) => {
                const isMe = u.id === currentUser.id;
                return (
                  <tr key={u.id} className="border-t" style={{ borderColor: "var(--border-soft)" }}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11.5px] font-semibold" style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
                          {initialsOf(u.name)}
                        </span>
                        <span className="font-medium" style={{ color: "var(--text)" }}>
                          {u.name}
                          {isMe && <span className="ml-1.5 text-[11px] font-normal" style={{ color: "var(--text-faint)" }}>(you)</span>}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3" style={{ color: "var(--text-muted)" }}>{u.email}</td>
                    <td className="px-4 py-3" style={{ color: "var(--text-muted)" }}>{u.phone || "—"}</td>
                    <td className="px-4 py-3">
                      <Tag tone={roleOf(u)?.locked ? "brand" : "muted"}>{roleOf(u)?.name ?? "—"}</Tag>
                    </td>
                    <td className="px-4 py-3">
                      <Tag tone={u.status === "active" ? "green" : "red"}>{u.status === "active" ? "Active" : "Blocked"}</Tag>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap" style={{ color: "var(--text-muted)" }}>{formatDateTime(u.lastLogin)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-0.5" style={{ color: "var(--text-muted)" }}>
                        <IconBtn label="View" onClick={() => setViewing(u)}><Eye size={15} /></IconBtn>
                        <IconBtn label="Edit" onClick={() => setEditing(u)}><Pencil size={15} /></IconBtn>
                        <IconBtn label="Reset password" onClick={() => setConfirm({ kind: "reset", user: u })}><KeyRound size={15} /></IconBtn>
                        {u.status === "active" ? (
                          <IconBtn label="Deactivate" disabled={isMe} onClick={() => setConfirm({ kind: "deactivate", user: u })}><Ban size={15} /></IconBtn>
                        ) : (
                          <IconBtn
                            label="Reactivate"
                            onClick={async () => {
                              const res = await setUserStatus(u.id, "active");
                              showToast(res.ok ? `${u.name} reactivated` : res.error, res.ok ? "success" : "error");
                            }}
                          >
                            <UserCheck size={15} />
                          </IconBtn>
                        )}
                        <IconBtn label="Delete" disabled={isMe} onClick={() => setConfirm({ kind: "delete", user: u })}><Trash2 size={15} /></IconBtn>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[12px]" style={{ color: "var(--text-faint)" }}>
        Users with activity history can&apos;t be hard-deleted — deactivate them so past orders and stock changes keep their author.
      </p>

      {editing && (
        <UserFormModal
          key={editing === "new" ? "new" : editing.id}
          user={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onDone={(c) => {
            setEditing(null);
            if (c) setCredentials(c);
          }}
        />
      )}
      {viewing && <ViewUserModal user={viewing} onClose={() => setViewing(null)} />}

      <Modal open={!!credentials} onClose={() => setCredentials(null)} title={credentials?.created ? "User created" : "Password reset"} footer={<PrimaryButton onClick={() => setCredentials(null)}><Check size={15} />Done</PrimaryButton>}>
        {credentials && (
          <>
            <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
              Share these with <b style={{ color: "var(--text)" }}>{credentials.name}</b> now — they are shown once and are not stored anywhere.
            </p>
            <CopyRow label="Temporary password" value={credentials.tempPassword} />
            <p className="text-[12px]" style={{ color: "var(--text-faint)" }}>
              They sign in with their email / username and this password, then choose their own password straight away. Any older sessions for this account were ended.
            </p>
          </>
        )}
      </Modal>

      <ConfirmDialog
        open={!!confirm}
        title={confirm ? confirmCopy[confirm.kind].title : ""}
        message={confirm ? confirmCopy[confirm.kind].message(confirm.user) : ""}
        confirmLabel={confirm ? confirmCopy[confirm.kind].label : ""}
        danger={confirm ? confirmCopy[confirm.kind].danger : true}
        onCancel={() => setConfirm(null)}
        onConfirm={runConfirm}
      />
    </div>
  );
}

function IconBtn({ label, onClick, children, disabled }: { label: string; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label} className="focus-ring rounded-md p-1.5 hover:bg-[var(--surface-2)] disabled:cursor-not-allowed disabled:opacity-30">
      {children}
    </button>
  );
}

export default function UsersPage() {
  return (
    <SettingsGate>
      <div className="space-y-5">
        <PageHeader title="Users & Roles" description="Staff accounts. Only Super Admins can manage users, roles and security." back={{ href: "/settings", label: "Settings" }} />
        <UsersTabs />
        <UsersPanel />
      </div>
    </SettingsGate>
  );
}
