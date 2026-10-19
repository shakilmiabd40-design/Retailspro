"use client";

import Link from "next/link";
import { useAccess } from "@/lib/settings/access";
import type { NotificationEventKey, NotificationEventPref } from "@/lib/settings/types";
import { FormShell, PageHeader, Section, SettingsGate, SoonTag, Toggle, useSectionForm } from "@/components/settings/ui";

const EVENTS: { key: NotificationEventKey; label: string; description: string; live: boolean }[] = [
  { key: "lowStock", label: "Low stock alerts", description: "A variant drops to Replenish, Critical or Out of stock.", live: true },
  { key: "newOrder", label: "New order created", description: "Someone creates an order.", live: false },
  { key: "returnRequest", label: "Return request", description: "A customer or supplier return is logged.", live: false },
  { key: "settlementReminder", label: "Settlement pending reminder (weekly)", description: "A weekly nudge listing unsettled courier payouts.", live: false },
];

function NotificationsForm() {
  const form = useSectionForm("notifications");
  const { roles } = useAccess();
  const { draft, set } = form;

  const setEvent = (k: NotificationEventKey, patch: Partial<NotificationEventPref>) => set("events", { ...draft.events, [k]: { ...draft.events[k], ...patch } });
  const toggleRole = (k: NotificationEventKey, id: string, on: boolean) => {
    const ids = new Set(draft.events[k].roleIds);
    if (on) ids.add(id);
    else ids.delete(id);
    setEvent(k, { roleIds: [...ids] });
  };

  return (
    <FormShell form={form}>
      <div className="rounded-xl border px-4 py-3 text-[12.5px]" style={{ background: "var(--surface-2)", borderColor: "var(--border-soft)", color: "var(--text-muted)" }}>
        Stock alerts already appear in-app (the bell and the Notifications page). <b>Low stock alerts → Email</b> really sends — turn it on, tick the roles below, and each of those people gets a real email (their account email) the moment a variant drops to Replenish, Critical or Out of Stock. SMS, and email for the other events below, are recorded here for later — nothing is sent for them yet. Stock thresholds and escalation live in{" "}
        <Link href="/notifications/settings" className="underline" style={{ color: "var(--brand-strong)" }}>
          Notifications → Thresholds &amp; routing
        </Link>
        .
      </div>

      {EVENTS.map((e) => {
        const pref = draft.events[e.key];
        return (
          <Section
            key={e.key}
            title={e.label}
            description={e.description}
            actions={
              <div className="flex items-center gap-2">
                {!e.live && <SoonTag />}
                <Toggle checked={pref.enabled} onChange={(v) => setEvent(e.key, { enabled: v })} label={`${e.label} enabled`} />
              </div>
            }
          >
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2" style={{ opacity: pref.enabled ? 1 : 0.5 }}>
              <div>
                <p className="mb-2 text-[12.5px] font-medium" style={{ color: "var(--text-muted)" }}>
                  Channels
                </p>
                <div className="flex flex-wrap gap-4">
                  {([["inApp", "In-app"], ["email", "Email"], ["sms", "SMS"]] as const).map(([field, label]) => (
                    <label key={field} className="flex cursor-pointer items-center gap-2 text-[13px]" style={{ color: "var(--text)" }}>
                      <input type="checkbox" className="h-4 w-4 accent-[var(--brand)]" checked={pref[field]} disabled={!pref.enabled} onChange={(ev) => setEvent(e.key, { [field]: ev.target.checked })} />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-[12.5px] font-medium" style={{ color: "var(--text-muted)" }}>
                  Who receives it (by role)
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {roles.map((r) => (
                    <label key={r.id} className="flex cursor-pointer items-center gap-2 text-[13px]" style={{ color: "var(--text)" }}>
                      <input type="checkbox" className="h-4 w-4 accent-[var(--brand)]" checked={pref.roleIds.includes(r.id)} disabled={!pref.enabled} onChange={(ev) => toggleRole(e.key, r.id, ev.target.checked)} />
                      {r.name}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </Section>
        );
      })}
    </FormShell>
  );
}

export default function Page() {
  return (
    <SettingsGate>
      <PageHeader title="Notifications" description="Which events notify whom, and how (optional)." back={{ href: "/settings", label: "Settings" }} />
      <div className="mt-5">
        <NotificationsForm />
      </div>
    </SettingsGate>
  );
}
