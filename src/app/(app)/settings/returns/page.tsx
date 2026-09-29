"use client";

import { Divided, FormShell, ListEditor, LockedTag, PageHeader, Section, SettingsGate, Tag, ToggleRow, useSectionForm } from "@/components/settings/ui";

function ReturnsForm() {
  const form = useSectionForm("returns");
  const { draft, set } = form;
  return (
    <FormShell form={form} onSave={() => (draft.customerReasons.length === 0 || draft.supplierReasons.length === 0 ? "Keep at least one reason in each list." : null)}>
      <Section title="Customer return rules">
        <Divided>
          <ToggleRow label="Allow returns only for Delivered orders" description="Recommended — nothing was actually sold on any other status. Off lets staff log a return against any order." checked={draft.customerOnlyDelivered} onChange={(v) => set("customerOnlyDelivered", v)} />
        </Divided>
        <div>
          <p className="mb-2 text-[13px] font-medium" style={{ color: "var(--text)" }}>
            Return reasons
          </p>
          <ListEditor items={draft.customerReasons} onChange={(v) => set("customerReasons", v)} placeholder="e.g. Sole came off" />
        </div>
        <div>
          <p className="mb-2 flex items-center gap-2 text-[13px] font-medium" style={{ color: "var(--text)" }}>
            Condition options <LockedTag />
          </p>
          <div className="flex gap-2">
            <Tag tone="green">New</Tag>
            <Tag tone="brand">Used</Tag>
            <Tag tone="red">Damaged</Tag>
          </div>
        </div>
      </Section>

      <Section title="Supplier return rules">
        <Divided>
          <ToggleRow label="Require a PO reference" description="A supplier return can't be saved without choosing the purchase order it came from." checked={draft.supplierRequirePoRef} onChange={(v) => set("supplierRequirePoRef", v)} />
        </Divided>
        <div>
          <p className="mb-2 text-[13px] font-medium" style={{ color: "var(--text)" }}>
            Supplier return reasons
          </p>
          <ListEditor items={draft.supplierReasons} onChange={(v) => set("supplierReasons", v)} placeholder="e.g. Wrong colour shipped" />
        </div>
      </Section>

      <Section title="Stock impact" description="How returns move stock. Fixed so inventory counts stay trustworthy.">
        <ul className="space-y-2 text-[13px]" style={{ color: "var(--text-muted)" }}>
          <li><b style={{ color: "var(--text)" }}>Customer return received</b> — stock increases, unless the item is Damaged (not resellable).</li>
          <li><b style={{ color: "var(--text)" }}>Supplier return received / closed</b> — stock decreases, because the item leaves the business.</li>
        </ul>
        <LockedTag />
      </Section>
    </FormShell>
  );
}

export default function Page() {
  return (
    <SettingsGate>
      <PageHeader title="Returns Settings" description="Customer and supplier return rules, reasons and stock impact." back={{ href: "/settings", label: "Settings" }} />
      <div className="mt-5">
        <ReturnsForm />
      </div>
    </SettingsGate>
  );
}
