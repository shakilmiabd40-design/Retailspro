"use client";

import { useSuppliers } from "@/lib/suppliers/store";
import { PO_STATUS_LABELS } from "@/lib/purchase-orders/utils";
import { PO_STATUS_ORDER } from "@/lib/settings/defaults";
import type { POStatusKey } from "@/lib/settings/types";
import { PoStatusBadge } from "@/components/purchase-orders/status-badge";
import { Divided, Field, FormShell, LockedTag, PageHeader, Section, SelectInput, SettingsGate, TextArea, ToggleRow, useSectionForm } from "@/components/settings/ui";

const FROM: POStatusKey[] = ["draft", "approved", "sent", "partially_received"];
const TO: POStatusKey[] = ["approved", "sent", "partially_received", "received", "cancelled"];

function PurchaseForm() {
  const form = useSectionForm("purchase");
  const { suppliers } = useSuppliers();
  const { draft, set } = form;

  const isForward = (from: POStatusKey, to: POStatusKey) => PO_STATUS_ORDER.indexOf(to) > PO_STATUS_ORDER.indexOf(from) || (to === "cancelled" && from !== "cancelled");

  function toggle(from: POStatusKey, to: POStatusKey, on: boolean) {
    const current = new Set(draft.transitions[from] ?? []);
    if (on) current.add(to);
    else current.delete(to);
    set("transitions", { ...draft.transitions, [from]: PO_STATUS_ORDER.filter((s) => current.has(s)) });
  }

  return (
    <FormShell form={form}>
      <Section
        title="PO status workflow"
        description="Draft → Approved → Sent → Partially Received → Received, with Cancelled available until fully received. Tick the moves your shop allows — the PO screen hides buttons for moves that are switched off."
      >
        <div className="flex flex-wrap items-center gap-2">
          {PO_STATUS_ORDER.map((s, i) => (
            <span key={s} className="flex items-center gap-2">
              <PoStatusBadge status={s} />
              {i < PO_STATUS_ORDER.length - 2 && <span style={{ color: "var(--text-faint)" }}>→</span>}
            </span>
          ))}
        </div>
        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
          <table className="w-full min-w-[620px] border-collapse text-[12.5px]">
            <thead>
              <tr style={{ background: "var(--surface-2)", color: "var(--text-faint)" }}>
                <th className="px-4 py-2.5 text-left font-medium">From ↓ &nbsp; To →</th>
                {TO.map((t) => (
                  <th key={t} className="px-3 py-2.5 text-center font-medium">{PO_STATUS_LABELS[t]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FROM.map((f) => (
                <tr key={f} className="border-t" style={{ borderColor: "var(--border-soft)" }}>
                  <td className="px-4 py-2.5 font-medium" style={{ color: "var(--text)" }}>{PO_STATUS_LABELS[f]}</td>
                  {TO.map((t) => (
                    <td key={t} className="px-3 py-2.5 text-center">
                      {isForward(f, t) && f !== t ? (
                        <input type="checkbox" className="h-4 w-4 accent-[var(--brand)]" checked={draft.transitions[f]?.includes(t) ?? false} onChange={(e) => toggle(f, t, e.target.checked)} aria-label={`${PO_STATUS_LABELS[f]} to ${PO_STATUS_LABELS[t]}`} />
                      ) : (
                        <span style={{ color: "var(--border)" }}>–</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[12px]" style={{ color: "var(--text-faint)" }}>
          Received and Cancelled are final. Receiving stock moves a PO to Partially Received / Received automatically.
        </p>
      </Section>

      <Section title="Receiving rules">
        <Divided>
          <ToggleRow label="Receiving creates a stock movement" description="Every receiving adds the received quantity to product stock." checked locked />
          <ToggleRow label="Unit cost editable at receiving" description="Off: the PO's unit cost is used as-is on the Receive Stock screen." checked={draft.unitCostEditableAtReceiving} onChange={(v) => set("unitCostEditableAtReceiving", v)} />
          <ToggleRow label="Prevent receiving beyond the ordered quantity" description="Recommended. Off lets you book extra units the supplier sent." checked={draft.preventOverReceive} onChange={(v) => set("preventOverReceive", v)} />
        </Divided>
        <LockedTag>Stock movement is always on</LockedTag>
      </Section>

      <Section title="Purchase defaults" description="Pre-filled on every new purchase order.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Default supplier (optional)">
            <SelectInput value={draft.defaultSupplierId} onChange={(v) => set("defaultSupplierId", v)} options={[{ value: "", label: "None — choose each time" }, ...suppliers.filter((s) => !s.archived).map((s) => ({ value: s.id, label: s.name }))]} />
          </Field>
        </div>
        <Field label="Default PO notes / terms">
          <TextArea rows={3} value={draft.defaultNotes} onChange={(e) => set("defaultNotes", e.target.value)} placeholder="e.g. Payment within 15 days of receiving. Goods must match the approved sample." />
        </Field>
      </Section>
    </FormShell>
  );
}

export default function Page() {
  return (
    <SettingsGate>
      <PageHeader title="Purchase Settings" description="Purchase order workflow, receiving rules and defaults." back={{ href: "/settings", label: "Settings" }} />
      <div className="mt-5">
        <PurchaseForm />
      </div>
    </SettingsGate>
  );
}
