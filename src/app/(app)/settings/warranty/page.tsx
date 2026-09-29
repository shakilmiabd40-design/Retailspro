"use client";

import { Divided, Field, FormShell, ListEditor, LockedTag, NumberInput, PageHeader, Section, SettingsGate, Tag, ToggleRow, useSectionForm } from "@/components/settings/ui";

function WarrantyForm() {
  const form = useSectionForm("warranty", { superAdminOnly: true });
  const { draft, set } = form;
  const years = draft.durationDays / 365;

  return (
    <FormShell
      form={form}
      readOnlyMessage="The warranty policy can only be edited by a Super Admin."
      onSave={() => (draft.durationDays < 1 ? "Warranty duration must be at least 1 day." : draft.claimIssueTypes.length === 0 ? "Keep at least one claim issue type." : null)}
    >
      <Section title="Warranty policy" description="Applies to warranties created from now on. Existing warranties keep the dates they were issued with.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Default warranty duration (days)" hint={Number.isInteger(years) ? `${years} year${years === 1 ? "" : "s"}` : `≈ ${years.toFixed(1)} years`}>
            <NumberInput min={1} value={draft.durationDays} onChange={(v) => set("durationDays", v)} />
          </Field>
          <Field label="Warranty starts from">
            <div className="flex items-center justify-between rounded-xl border px-3 py-2 text-[13px]" style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--text)" }}>
              Delivered date
              <LockedTag />
            </div>
          </Field>
        </div>
        <Divided>
          <ToggleRow label="Auto-create warranty when an order is Delivered" description="One warranty per order line. Partial Delivered, Refuse Return and Cancelled orders never get one." checked locked />
        </Divided>
      </Section>

      <Section title="Eligibility">
        <Divided>
          <ToggleRow label="Only Delivered items are covered" checked locked />
          <ToggleRow label="Void the warranty automatically on a sales return / refund" description="When a customer return is approved, the warranty on exactly the returned items is voided." checked={draft.voidOnReturn} onChange={(v) => set("voidOnReturn", v)} />
        </Divided>
      </Section>

      <Section title="Claim rules">
        <Divided>
          <ToggleRow label="A claim is allowed only while today ≤ warranty end date" checked locked />
        </Divided>
        <div>
          <p className="mb-2 flex items-center gap-2 text-[13px] font-medium" style={{ color: "var(--text)" }}>
            Claim status workflow <LockedTag />
          </p>
          <div className="flex flex-wrap items-center gap-1.5 text-[12px]" style={{ color: "var(--text-faint)" }}>
            <Tag>Submitted</Tag>→<Tag tone="green">Approved</Tag>/<Tag tone="red">Rejected</Tag>→<Tag tone="blue">In Service</Tag>→<Tag tone="brand">Replaced</Tag>/<Tag tone="brand">Refunded</Tag>→<Tag>Closed</Tag>
          </div>
        </div>
        <div>
          <p className="mb-2 text-[13px] font-medium" style={{ color: "var(--text)" }}>
            Claim issue types
          </p>
          <ListEditor items={draft.claimIssueTypes} onChange={(v) => set("claimIssueTypes", v)} placeholder="e.g. Zipper failure" />
        </div>
      </Section>
    </FormShell>
  );
}

export default function Page() {
  return (
    <SettingsGate>
      <PageHeader title="Warranty Settings" description="Warranty duration, eligibility and claim rules." back={{ href: "/settings", label: "Settings" }} />
      <div className="mt-5">
        <WarrantyForm />
      </div>
    </SettingsGate>
  );
}
