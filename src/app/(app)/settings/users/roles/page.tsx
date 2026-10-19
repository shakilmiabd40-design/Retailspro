"use client";

import { useState } from "react";
import { Copy, Lock, Plus, Trash2 } from "lucide-react";
import { useAccess } from "@/lib/settings/access";
import { PRESET_ROLES, TOTAL_PERMISSIONS, countPermissions } from "@/lib/settings/permissions";
import type { PermissionMap, Role } from "@/lib/settings/types";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PermissionMatrix } from "@/components/settings/permission-matrix";
import { UsersTabs } from "@/components/settings/users-tabs";
import { Field, GhostButton, PageHeader, PrimaryButton, Section, SelectInput, SettingsGate, Tag, TextArea, TextInput } from "@/components/settings/ui";

type Draft = { id: string | null; name: string; description: string; permissions: PermissionMap };

function toDraft(role: Role | null, seed?: Role): Draft {
  if (role) return { id: role.id, name: role.name, description: role.description, permissions: structuredClone(role.permissions) };
  return { id: null, name: "", description: "", permissions: seed ? structuredClone(seed.permissions) : {} };
}

function RolesPanel() {
  const { roles, users, addRole, updateRole, deleteRole } = useAccess();
  const showToast = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(roles[0]?.id ?? null);
  const [draft, setDraft] = useState<Draft>(() => toDraft(roles[0] ?? null));
  const [pendingDelete, setPendingDelete] = useState<Role | null>(null);

  const selected = roles.find((r) => r.id === draft.id) ?? null;
  const locked = !!selected?.locked;
  const dirty = !selected ? true : JSON.stringify({ n: draft.name, d: draft.description, p: draft.permissions }) !== JSON.stringify({ n: selected.name, d: selected.description, p: selected.permissions });

  function select(role: Role) {
    setSelectedId(role.id);
    setDraft(toDraft(role));
  }

  async function save() {
    if (draft.id) {
      const res = await updateRole(draft.id, draft);
      showToast(res.ok ? "Role saved" : res.error, res.ok ? "success" : "error");
    } else {
      const res = await addRole(draft);
      if (!res.ok) return showToast(res.error, "error");
      showToast("Role created");
      setSelectedId(res.role.id);
      setDraft(toDraft(res.role));
    }
  }

  function duplicate(role: Role) {
    setSelectedId(null);
    setDraft({ id: null, name: `${role.name} (copy)`, description: role.description, permissions: structuredClone(role.locked ? PRESET_ROLES[0].permissions : role.permissions) });
  }

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
      <div className="space-y-2">
        <PrimaryButton
          className="w-full justify-center"
          onClick={() => {
            setSelectedId(null);
            setDraft(toDraft(null));
          }}
        >
          <Plus size={15} />
          New role
        </PrimaryButton>
        {roles.map((r) => {
          const count = users.filter((u) => u.roleId === r.id).length;
          const active = selectedId === r.id;
          return (
            <button
              key={r.id}
              onClick={() => select(r)}
              className="focus-ring card w-full p-3.5 text-left transition-colors"
              style={{ borderColor: active ? "var(--brand)" : undefined, background: active ? "var(--brand-soft)" : undefined }}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-[13.5px] font-semibold" style={{ color: "var(--text)" }}>
                  {r.name}
                </p>
                {r.locked ? <Lock size={13} style={{ color: "var(--text-faint)" }} /> : r.builtIn ? <Tag>Preset</Tag> : <Tag tone="blue">Custom</Tag>}
              </div>
              <p className="mt-1 line-clamp-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
                {r.description || "No description"}
              </p>
              <p className="mt-2 text-[11.5px]" style={{ color: "var(--text-faint)" }}>
                {count} user{count === 1 ? "" : "s"} · {r.locked ? TOTAL_PERMISSIONS : countPermissions(r.permissions)} of {TOTAL_PERMISSIONS} permissions
              </p>
            </button>
          );
        })}
      </div>

      <Section
        title={draft.id ? `Edit role — ${selected?.name ?? ""}` : "New role"}
        description={locked ? "Super Admin always holds every permission and can't be edited." : "Tick what this role may do in each module. Anything beyond View automatically includes View."}
        actions={
          selected && (
            <div className="flex gap-2">
              <GhostButton onClick={() => duplicate(selected)}>
                <Copy size={14} />
                Duplicate
              </GhostButton>
              {!selected.builtIn && (
                <GhostButton danger onClick={() => setPendingDelete(selected)}>
                  <Trash2 size={14} />
                  Delete
                </GhostButton>
              )}
            </div>
          )
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Role name" required>
            <TextInput value={draft.name} disabled={locked} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="e.g. Packing Staff" />
          </Field>
          {!draft.id && (
            <Field label="Start from a preset">
              <SelectInput
                value="blank"
                onChange={(v) => {
                  const preset = PRESET_ROLES.find((r) => r.id === v);
                  setDraft((d) => ({ ...d, permissions: preset ? structuredClone(preset.permissions) : {} }));
                }}
                options={[{ value: "blank", label: "Choose to copy permissions…" }, ...PRESET_ROLES.map((r) => ({ value: r.id, label: r.name }))]}
              />
            </Field>
          )}
        </div>
        <Field label="Description">
          <TextArea rows={2} value={draft.description} disabled={locked} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} />
        </Field>

        <PermissionMatrix value={locked ? PRESET_ROLES[0].permissions : draft.permissions} readOnly={locked} onChange={(p) => setDraft((d) => ({ ...d, permissions: p }))} />

        <div className="space-y-1 rounded-xl px-3.5 py-2.5 text-[12px]" style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
          <p>
            <b style={{ color: "var(--text)" }}>Financial</b> controls who sees cost price, profit / loss and courier cost — keep it off for Sales. <b style={{ color: "var(--text)" }}>Settlement</b> lets a role add or edit courier payouts.
          </p>
          <p>
            Under <b style={{ color: "var(--text)" }}>Settings</b>: View opens the settings pages, Edit saves them, and Settings access unlocks users, roles and security.
          </p>
        </div>

        {!locked && (
          <div className="flex justify-end gap-2">
            {selected && (
              <GhostButton onClick={() => setDraft(toDraft(selected))} disabled={!dirty}>
                Discard
              </GhostButton>
            )}
            <PrimaryButton onClick={save} disabled={!dirty}>
              {draft.id ? "Save role" : "Create role"}
            </PrimaryButton>
          </div>
        )}
      </Section>

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete role"
        message={`Delete the "${pendingDelete?.name}" role? Roles that still have users can't be deleted.`}
        confirmLabel="Delete"
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (!pendingDelete) return;
          const res = await deleteRole(pendingDelete.id);
          setPendingDelete(null);
          if (!res.ok) return showToast(res.error, "error");
          showToast("Role deleted");
          select(roles[0]);
        }}
      />
    </div>
  );
}

export default function RolesPage() {
  return (
    <SettingsGate>
      <div className="space-y-5">
        <PageHeader title="Users & Roles" description="Build custom roles with a per-module permission matrix." back={{ href: "/settings", label: "Settings" }} />
        <UsersTabs />
        <RolesPanel />
      </div>
    </SettingsGate>
  );
}
