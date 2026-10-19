"use client";

import { useRef, useState } from "react";
import { Check, Download, ShieldAlert, Upload, X } from "lucide-react";
import { useAccess } from "@/lib/settings/access";
import { api, HttpError } from "@/lib/persist/api";
import { formatDateTime } from "@/lib/settings/runtime";
import { passwordProblems } from "@/lib/settings/security";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Divided, Field, FormShell, GhostButton, NumberInput, PageHeader, Section, SettingsGate, TextInput, ToggleRow, useSectionForm } from "@/components/settings/ui";
import { useSettings } from "@/lib/settings/store";
import { shopSlug } from "@/lib/settings/shop";

function PasswordTester({ policy }: { policy: Parameters<typeof passwordProblems>[1] }) {
  const [pw, setPw] = useState("");
  const problems = passwordProblems(pw, policy);
  const rules = [
    { label: `At least ${policy.minPasswordLength} characters`, ok: pw.length >= policy.minPasswordLength },
    ...(policy.requireUppercase ? [{ label: "An uppercase letter", ok: /[A-Z]/.test(pw) }] : []),
    ...(policy.requireNumber ? [{ label: "A number", ok: /[0-9]/.test(pw) }] : []),
    ...(policy.requireSymbol ? [{ label: "A symbol", ok: /[^A-Za-z0-9]/.test(pw) }] : []),
  ];
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "var(--border-soft)", background: "var(--surface-2)" }}>
      <Field label="Try a password against this policy" hint="Nothing you type here is saved or sent anywhere.">
        <TextInput type="text" autoComplete="off" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Type a sample password" />
      </Field>
      {pw && (
        <ul className="mt-3 space-y-1">
          {rules.map((r) => (
            <li key={r.label} className="flex items-center gap-2 text-[12.5px]" style={{ color: r.ok ? "var(--green)" : "var(--red)" }}>
              {r.ok ? <Check size={14} /> : <X size={14} />}
              {r.label}
            </li>
          ))}
          {problems.length === 0 && <li className="pt-1 text-[12.5px] font-medium" style={{ color: "var(--green)" }}>Meets the policy.</li>}
        </ul>
      )}
    </div>
  );
}

interface BackupFile {
  app: string;
  version: number;
  exportedAt: string;
  collections: Record<string, unknown[]>;
  documents: Record<string, unknown>;
}

function BackupSection() {
  const { isSuperAdmin } = useAccess();
  const { settings } = useSettings();
  const shopName = settings.company.shopName.trim() || "your shop";
  const showToast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<BackupFile | null>(null);
  const [busy, setBusy] = useState(false);

  if (!isSuperAdmin) {
    return (
      <Section title="Backup & restore" description="Only a Super Admin can download or restore a backup.">
        <p className="flex items-center gap-2 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
          <ShieldAlert size={15} /> Ask a Super Admin.
        </p>
      </Section>
    );
  }

  async function download() {
    setBusy(true);
    try {
      const res = await fetch("/api/backup", { credentials: "same-origin" });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${shopSlug(shopName)}-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast("Backup downloaded");
    } catch {
      showToast("Couldn't create the backup", "error");
    } finally {
      setBusy(false);
    }
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result)) as BackupFile;
        if ((data.app !== "inventorypro" && data.app !== "retailpro") || data.version !== 2 || !data.collections || !data.documents) throw new Error();
        setPending(data);
      } catch {
        showToast(`That doesn't look like a backup file for ${shopName}.`, "error");
      }
    };
    reader.readAsText(file);
  }

  async function restore() {
    if (!pending) return;
    setBusy(true);
    try {
      await api("POST", "/api/restore", pending);
      window.location.reload();
    } catch (err) {
      showToast(err instanceof HttpError ? err.message : "Restore failed", "error");
      setBusy(false);
      setPending(null);
    }
  }

  const counts = pending ? Object.entries(pending.collections).map(([k, v]) => `${v.length} ${k.replace("_", " ")}`).join(", ") : "";

  return (
    <Section title="Backup & restore" description="Products, orders, suppliers, settings and the other shop data live in your PostgreSQL database. Download a JSON copy regularly and before big changes. Users, roles and passwords aren't part of it — your database provider's own backups (Neon / Aiven) cover those.">
      <div className="flex flex-wrap gap-2">
        <GhostButton onClick={download} disabled={busy}>
          <Download size={15} />
          Download backup
        </GhostButton>
        <GhostButton onClick={() => fileRef.current?.click()} disabled={busy}>
          <Upload size={15} />
          Restore from file…
        </GhostButton>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onFile} />
      </div>
      <ConfirmDialog
        open={!!pending}
        title="Restore this backup?"
        message={pending ? `This replaces ALL current shop data with the backup taken ${pending.exportedAt ? formatDateTime(pending.exportedAt) : "on an unknown date"} (${counts || "no records"}). Everyone using the app will see the restored data. This can't be undone — download a fresh backup first if unsure.` : ""}
        confirmLabel="Replace all data"
        onCancel={() => setPending(null)}
        onConfirm={restore}
      />
    </Section>
  );
}

function SecurityForm() {
  const form = useSectionForm("security");
  const { draft, set } = form;
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2 rounded-xl border px-4 py-3 text-[12.5px]" style={{ background: "var(--brand-tint-bg)", borderColor: "var(--brand-tint-border)", color: "var(--text-muted)" }}>
        <ShieldAlert size={15} className="mt-0.5 shrink-0" style={{ color: "var(--brand)" }} />
        Password rules, first-login reset, idle timeout and the failed-attempt lockout are enforced by the server at sign-in. Passwords are stored only as salted scrypt hashes.
      </div>

      <FormShell
        form={form}
        onSave={() =>
          draft.minPasswordLength < 6 || draft.minPasswordLength > 64
            ? "Minimum password length must be between 6 and 64."
            : draft.sessionTimeoutMinutes < 5
              ? "Session timeout must be at least 5 minutes."
              : draft.maxLoginAttempts < 1
                ? "Allow at least 1 login attempt."
                : null
        }
      >
        <Section title="Password policy">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Minimum length">
              <NumberInput min={6} max={64} value={draft.minPasswordLength} onChange={(v) => set("minPasswordLength", v)} />
            </Field>
          </div>
          <Divided>
            <ToggleRow label="Require an uppercase letter" checked={draft.requireUppercase} onChange={(v) => set("requireUppercase", v)} />
            <ToggleRow label="Require a number" checked={draft.requireNumber} onChange={(v) => set("requireNumber", v)} />
            <ToggleRow label="Require a symbol" checked={draft.requireSymbol} onChange={(v) => set("requireSymbol", v)} />
            <ToggleRow label="Force password reset on first login" description="New users and reset passwords must be changed at next sign-in." checked={draft.forceResetOnFirstLogin} onChange={(v) => set("forceResetOnFirstLogin", v)} />
          </Divided>
          <PasswordTester policy={draft} />
        </Section>

        <Section title="Sessions & sign-in">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Session timeout (minutes)" hint="Idle time before signing out.">
              <NumberInput min={5} value={draft.sessionTimeoutMinutes} onChange={(v) => set("sessionTimeoutMinutes", v)} />
            </Field>
            <Field label="Failed login attempts allowed" hint="Anti brute-force limit.">
              <NumberInput min={1} value={draft.maxLoginAttempts} onChange={(v) => set("maxLoginAttempts", v)} />
            </Field>
            <Field label="Lockout duration (minutes)">
              <NumberInput min={1} value={draft.lockoutMinutes} onChange={(v) => set("lockoutMinutes", v)} />
            </Field>
          </div>
          <Divided>
            <ToggleRow label="Two-factor authentication (optional)" description="Ask for a one-time code after the password. Not available in this version." checked={draft.twoFactorEnabled} onChange={(v) => set("twoFactorEnabled", v)} soon />
          </Divided>
        </Section>
      </FormShell>

      <BackupSection />
    </div>
  );
}

export default function Page() {
  return (
    <SettingsGate>
      <PageHeader title="Security" description="Password policy, sessions and login protection. Super Admin controlled." back={{ href: "/settings", label: "Settings" }} />
      <div className="mt-5">
        <SecurityForm />
      </div>
    </SettingsGate>
  );
}
