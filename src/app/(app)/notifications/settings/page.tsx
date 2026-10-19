"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Trash2 } from "lucide-react";
import { useNotifications } from "@/lib/notifications/store";
import {
  CHANNEL_LABELS,
  DEFAULT_SETTINGS,
  NOTIFIABLE_STATUSES,
  OWNER_ROLE_LABELS,
  SEVERITY_FOR_STATUS,
  STATUS_LABELS,
  levelUpperBound,
  ownerRoleFor,
  routeChannels,
} from "@/lib/notifications/engine";
import type { InventoryStatus, NotificationSettings } from "@/lib/notifications/types";
import { useToast } from "@/components/toast";
import { InventoryStatusBadge, SeverityBadge } from "@/components/notifications/badges";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { GhostButton, TextInput, Toggle } from "@/components/settings/ui";

const inputStyle = { borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" };
const inputClass = "focus-ring w-full rounded-xl border px-3 py-2 text-[13px]";
const ESCALATING: InventoryStatus[] = ["critical", "out_of_stock", "replenish", "hold_blocked"];

function NumField({ label, hint, value, onChange }: { label: string; hint?: string; value: number; onChange: (n: number) => void }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12.5px] font-medium" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <input type="number" min={0} value={Number.isFinite(value) ? value : 0} onChange={(e) => onChange(Number(e.target.value))} className={inputClass} style={inputStyle} />
      {hint && (
        <span className="mt-1 block text-[11.5px]" style={{ color: "var(--text-faint)" }}>
          {hint}
        </span>
      )}
    </label>
  );
}

function SettingsForm({ initial }: { initial: NotificationSettings }) {
  const { updateSettings, resetSettings } = useNotifications();
  const showToast = useToast();
  const [draft, setDraft] = useState<NotificationSettings>(initial);

  const set = <K extends keyof NotificationSettings>(key: K, value: NotificationSettings[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const setEscalation = (status: InventoryStatus, minutes: number) => setDraft((d) => ({ ...d, escalationMinutes: { ...d.escalationMinutes, [status]: minutes } }));
  const setCategory = (status: InventoryStatus, on: boolean) =>
    setDraft((d) => ({
      ...d,
      disabledStatuses: on ? d.disabledStatuses.filter((s) => s !== status) : [...new Set([...d.disabledStatuses, status])],
    }));

  const invalid = draft.emergencyThreshold > draft.reorderPoint;
  const monitorTop = levelUpperBound("monitor", draft);

  return (
    <div className="space-y-5 pb-10">
      <Link href="/notifications" className="focus-ring flex items-center gap-1.5 text-[12.5px] font-medium" style={{ color: "var(--text-muted)" }}>
        <ArrowLeft size={14} />
        Back to Notifications
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold" style={{ color: "var(--text)" }}>
            Thresholds &amp; routing
          </h1>
          <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
            Statuses are re-evaluated for every item as soon as you save.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              resetSettings();
              setDraft(DEFAULT_SETTINGS);
              showToast("Defaults restored");
            }}
            className="focus-ring rounded-xl border px-4 py-2 text-[13px] font-medium"
            style={{ borderColor: "var(--border)", color: "var(--text)" }}
          >
            Restore defaults
          </button>
          <button
            disabled={invalid}
            onClick={() => {
              updateSettings(draft);
              showToast("Settings saved");
            }}
            className="focus-ring rounded-xl px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-40"
            style={{ background: "var(--brand)" }}
          >
            Save changes
          </button>
        </div>
      </div>

      <section className="card space-y-4 p-5">
        <p className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>
          Stock thresholds
        </p>
        <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
          Measured on available units (on hand minus reserved). Out of stock <b style={{ color: "var(--text)" }}>= 0</b> · Critical <b style={{ color: "var(--text)" }}>≤ {draft.emergencyThreshold}</b> · Replenish{" "}
          <b style={{ color: "var(--text)" }}>≤ {draft.reorderPoint}</b> · Monitor <b style={{ color: "var(--text)" }}>≤ {monitorTop}</b> · On target{" "}
          <b style={{ color: "var(--text)" }}>&gt; {monitorTop}</b>
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <NumField label="Reorder point" hint="At or below this, start replenishing." value={draft.reorderPoint} onChange={(v) => set("reorderPoint", v)} />
          <NumField label="Emergency threshold" hint="At or below this, treat as critical." value={draft.emergencyThreshold} onChange={(v) => set("emergencyThreshold", v)} />
          <NumField label="Monitor band (× reorder point)" hint="Watch items up to this multiple of the reorder point." value={draft.monitorMultiplier} onChange={(v) => set("monitorMultiplier", v)} />
          <NumField label="Recovery headroom (%)" hint="Extra stock needed before a status improves, so it doesn't flip back and forth." value={draft.hysteresisPct} onChange={(v) => set("hysteresisPct", v)} />
          <NumField label="Suggested order-up-to (× reorder point)" hint="Purchase order suggestions top stock up to this level." value={draft.orderUpToMultiplier} onChange={(v) => set("orderUpToMultiplier", v)} />
        </div>
        {invalid && (
          <p className="text-[12.5px]" style={{ color: "var(--red)" }}>
            The emergency threshold can&apos;t be higher than the reorder point.
          </p>
        )}
      </section>

      <section className="card space-y-4 p-5">
        <div>
          <p className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>
            Categories
          </p>
          <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
            Turn off a category to stop new notifications of that kind from being created — fewer alerts to wade through, less stored over time. The stock board and item history keep updating either way; only the notification itself is skipped.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {NOTIFIABLE_STATUSES.map((s) => {
            const on = !draft.disabledStatuses.includes(s);
            return (
              <label
                key={s}
                className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-3 py-2.5"
                style={{ borderColor: "var(--border)", opacity: on ? 1 : 0.65 }}
              >
                <InventoryStatusBadge status={s} />
                <Toggle checked={on} onChange={(v) => setCategory(s, v)} label={`${STATUS_LABELS[s]} notifications`} />
              </label>
            );
          })}
        </div>
      </section>

      <section className="card space-y-4 p-5">
        <div>
          <p className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>
            Escalation
          </p>
          <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
            Minutes before an unacknowledged notification escalates to the owner&apos;s lead. Use 0 to turn escalation off.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {ESCALATING.map((s) => (
            <NumField key={s} label={STATUS_LABELS[s]} value={draft.escalationMinutes[s] ?? 0} onChange={(v) => setEscalation(s, v)} />
          ))}
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="p-5 pb-3">
          <p className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>
            Routing
          </p>
          <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
            Who owns each status and which channels it is meant for. The dashboard delivers in-app alerts; the other channels are recorded on each notification&apos;s payload for your email, push or SMS service to send.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left text-[13px]">
            <thead>
              <tr className="text-[11.5px]" style={{ color: "var(--text-faint)", background: "var(--surface-2)" }}>
                <th className="px-5 py-2.5 font-medium">Status</th>
                <th className="px-5 py-2.5 font-medium">Severity</th>
                <th className="px-5 py-2.5 font-medium">Owner</th>
                <th className="px-5 py-2.5 font-medium">Channels</th>
              </tr>
            </thead>
            <tbody>
              {NOTIFIABLE_STATUSES.map((s) => (
                <tr key={s} className="border-t" style={{ borderColor: "var(--border-soft)" }}>
                  <td className="px-5 py-2.5">
                    <InventoryStatusBadge status={s} />
                  </td>
                  <td className="px-5 py-2.5">
                    <SeverityBadge severity={SEVERITY_FOR_STATUS[s]} />
                  </td>
                  <td className="px-5 py-2.5" style={{ color: "var(--text-muted)" }}>
                    {OWNER_ROLE_LABELS[ownerRoleFor(s)]}
                  </td>
                  <td className="px-5 py-2.5" style={{ color: "var(--text-muted)" }}>
                    {routeChannels(s).map((c) => CHANNEL_LABELS[c]).join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function monthsAgo(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
}

/** Resolved notifications already auto-trim to the most recent 200 (see engine.ts). This lets you clear older ones sooner, on your own schedule. */
function CleanupSection() {
  const { notifications, clearResolved, purgeResolvedBefore } = useNotifications();
  const showToast = useToast();
  const [cutoff, setCutoff] = useState(monthsAgo(1));
  const [confirming, setConfirming] = useState(false);

  const resolvedCount = useMemo(() => notifications.filter((n) => n.state === "resolved").length, [notifications]);
  const matchCount = useMemo(() => {
    const end = `${cutoff}T23:59:59.999Z`;
    return notifications.filter((n) => n.state === "resolved" && !!n.resolvedAt && n.resolvedAt < end).length;
  }, [notifications, cutoff]);

  function purge() {
    const removed = purgeResolvedBefore(`${cutoff}T23:59:59.999Z`);
    showToast(removed > 0 ? `Deleted ${removed} old notification${removed === 1 ? "" : "s"}` : "Nothing to delete");
    setConfirming(false);
  }

  return (
    <section className="card space-y-4 p-5">
      <div>
        <p className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>
          Clean up old notifications
        </p>
        <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
          Resolved notifications are kept automatically ({resolvedCount} right now, auto-trimmed to the most recent 200). Delete older resolved ones sooner if you&apos;d rather not wait.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-48">
          <p className="mb-1 text-[11.5px]" style={{ color: "var(--text-faint)" }}>
            Delete resolved before
          </p>
          <TextInput type="date" value={cutoff} onChange={(e) => setCutoff(e.target.value)} max={monthsAgo(0)} />
        </div>
        <p className="pb-2 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
          {matchCount === 0 ? "Nothing that old." : `${matchCount} of ${resolvedCount} resolved notification${resolvedCount === 1 ? "" : "s"} match.`}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <GhostButton onClick={() => setConfirming(true)} disabled={!matchCount}>
          <Trash2 size={15} />
          Delete these notifications
        </GhostButton>
        {resolvedCount > 0 && (
          <GhostButton
            onClick={() => {
              clearResolved();
              showToast("Cleared all resolved notifications");
            }}
          >
            Clear all resolved now
          </GhostButton>
        )}
      </div>

      <ConfirmDialog
        open={confirming}
        title="Delete old notifications?"
        message={`This permanently deletes ${matchCount} resolved notification${matchCount === 1 ? "" : "s"} resolved before ${cutoff}. This can't be undone.`}
        confirmLabel="Delete permanently"
        onCancel={() => setConfirming(false)}
        onConfirm={purge}
      />
    </section>
  );
}

export default function NotificationSettingsPage() {
  const { settings, hydrated } = useNotifications();
  if (!hydrated) return <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading…</p>;
  return (
    <div className="space-y-5">
      <SettingsForm initial={settings} />
      <CleanupSection />
    </div>
  );
}
