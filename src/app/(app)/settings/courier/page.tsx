"use client";

import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { useOrders } from "@/lib/orders/store";
import type { Courier, SettlementMode } from "@/lib/settings/types";
import { useToast } from "@/components/toast";
import { EmptyRow, Divided, Field, FormShell, GhostButton, LockedTag, Modal, NumberInput, PageHeader, PrimaryButton, RowDelete, Section, SettingsGate, Tag, TextInput, ToggleRow, useSectionForm, SelectInput } from "@/components/settings/ui";
import { ConfirmDialog } from "@/components/confirm-dialog";

const MODES: { value: SettlementMode; label: string; description: string }[] = [
  { value: "auto", label: "Auto expected", description: "Expected settlement is always calculated from the order (collected − courier cost). No manual changes." },
  { value: "manual", label: "Manual expected", description: "Nothing is expected until someone types the amount for each order." },
  { value: "auto_override", label: "Auto + allow override (recommended)", description: "Calculated by default; an admin can override the expected amount when a courier's payout differs." },
];

function CourierEditor({ courier, taken, onClose, onSave }: { courier: Courier | null; taken: string[]; onClose: () => void; onSave: (c: Courier) => void }) {
  const showToast = useToast();
  const [c, setC] = useState<Courier>(courier ?? { id: `cr-${crypto.randomUUID().slice(0, 8)}`, name: "", phone: "", defaultForwardCost: 0, defaultReturnCost: 0, status: "active" });
  function submit() {
    const name = c.name.trim();
    if (!name) return showToast("Courier name is required", "error");
    if (taken.some((t) => t.toLowerCase() === name.toLowerCase())) return showToast("A courier with that name already exists", "error");
    onSave({ ...c, name });
  }
  return (
    <Modal open onClose={onClose} title={courier ? "Edit courier" : "Add courier"} footer={<><GhostButton onClick={onClose}>Cancel</GhostButton><PrimaryButton onClick={submit}>Done</PrimaryButton></>}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Courier name" required>
          <TextInput autoFocus value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} />
        </Field>
        <Field label="Phone / support contact">
          <TextInput value={c.phone} onChange={(e) => setC({ ...c, phone: e.target.value })} />
        </Field>
        <Field label="Default forward cost (৳)" hint="Pre-fills the dispatch form.">
          <NumberInput value={c.defaultForwardCost} onChange={(v) => setC({ ...c, defaultForwardCost: v })} />
        </Field>
        <Field label="Default return cost (৳)">
          <NumberInput value={c.defaultReturnCost} onChange={(v) => setC({ ...c, defaultReturnCost: v })} />
        </Field>
        <Field label="Status">
          <SelectInput value={c.status} onChange={(v) => setC({ ...c, status: v })} options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} />
        </Field>
      </div>
    </Modal>
  );
}

function CourierForm() {
  const form = useSectionForm("courier");
  const { orders } = useOrders();
  const showToast = useToast();
  const { draft, set } = form;
  const [editing, setEditing] = useState<Courier | "new" | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Courier | null>(null);

  const usage = (name: string) => orders.filter((o) => o.courier.company.toLowerCase() === name.toLowerCase()).length;

  return (
    <FormShell form={form}>
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-5 pb-3">
          <div>
            <p className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>
              Courier companies
            </p>
            <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
              Offered on the dispatch form. Couriers with order history can be made inactive but not deleted.
            </p>
          </div>
          <PrimaryButton onClick={() => setEditing("new")}>
            <Plus size={15} />
            Add courier
          </PrimaryButton>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-[13px]">
            <thead>
              <tr className="text-[11.5px]" style={{ color: "var(--text-faint)", background: "var(--surface-2)" }}>
                {["Courier", "Contact", "Default forward", "Default return", "Orders", "Status", ""].map((h, i) => (
                  <th key={i} className="px-5 py-2.5 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {draft.couriers.length === 0 && <EmptyRow cols={7}>No couriers yet.</EmptyRow>}
              {draft.couriers.map((c) => (
                <tr key={c.id} className="border-t" style={{ borderColor: "var(--border-soft)" }}>
                  <td className="px-5 py-3 font-medium" style={{ color: "var(--text)" }}>{c.name}</td>
                  <td className="px-5 py-3" style={{ color: "var(--text-muted)" }}>{c.phone || "—"}</td>
                  <td className="px-5 py-3" style={{ color: "var(--text-muted)" }}>৳{c.defaultForwardCost}</td>
                  <td className="px-5 py-3" style={{ color: "var(--text-muted)" }}>৳{c.defaultReturnCost}</td>
                  <td className="px-5 py-3" style={{ color: "var(--text-muted)" }}>{usage(c.name)}</td>
                  <td className="px-5 py-3"><Tag tone={c.status === "active" ? "green" : "muted"}>{c.status === "active" ? "Active" : "Inactive"}</Tag></td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-0.5">
                      <button type="button" aria-label={`Edit ${c.name}`} onClick={() => setEditing(c)} className="focus-ring rounded-md p-1.5" style={{ color: "var(--text-faint)" }}>
                        <Pencil size={15} />
                      </button>
                      <RowDelete label={`Delete ${c.name}`} onClick={() => (usage(c.name) > 0 ? showToast(`${c.name} has ${usage(c.name)} order(s) — set it to Inactive instead of deleting.`, "error") : setPendingDelete(c))} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Section title="Courier cost fields" description="Every dispatched order records these three amounts.">
        <div className="flex flex-wrap items-center gap-2 text-[13px]" style={{ color: "var(--text)" }}>
          <Tag tone="blue">Forward cost</Tag> + <Tag tone="blue">Return cost</Tag> + <Tag tone="blue">Other fees</Tag> = <Tag tone="brand">Actual courier cost</Tag>
          <LockedTag />
        </div>
      </Section>

      <Section title="Partial Delivered / Refuse Return policy" description="How courier profit and loss are worked out. Shown here so admins and developers see the same rules.">
        <ul className="space-y-2 text-[13px]" style={{ color: "var(--text-muted)" }}>
          <li><b style={{ color: "var(--text)" }}>Partial Delivered</b> — net = customer paid − actual courier cost. Positive is profit, negative is loss.</li>
          <li><b style={{ color: "var(--text)" }}>Refuse Return</b> — loss = actual courier cost.</li>
          <li><b style={{ color: "var(--text)" }}>Cancelled</b> — courier cost = 0 (the parcel never shipped).</li>
        </ul>
        <LockedTag />
      </Section>

      <Section title="Settlement tracking">
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <span style={{ color: "var(--text-muted)" }}>Statuses:</span>
          <Tag tone="red">Unsettled</Tag>
          <Tag tone="brand">Partially settled</Tag>
          <Tag tone="green">Settled</Tag>
          <LockedTag />
        </div>
        <div>
          <p className="mb-2 text-[13px] font-medium" style={{ color: "var(--text)" }}>
            Expected settlement calculation
          </p>
          <div className="space-y-2">
            {MODES.map((m) => (
              <label key={m.value} className="flex cursor-pointer items-start gap-3 rounded-xl border p-3.5" style={{ borderColor: draft.settlementMode === m.value ? "var(--brand)" : "var(--border)", background: draft.settlementMode === m.value ? "var(--brand-soft)" : "transparent" }}>
                <input type="radio" name="settlement-mode" className="mt-0.5 accent-[var(--brand)]" checked={draft.settlementMode === m.value} onChange={() => set("settlementMode", m.value)} />
                <span>
                  <span className="block text-[13px] font-medium" style={{ color: "var(--text)" }}>{m.label}</span>
                  <span className="block text-[12px]" style={{ color: "var(--text-muted)" }}>{m.description}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
        <Divided>
          <ToggleRow label="Allow one payout to cover several orders" description="Couriers usually remit in bulk. Off: each payout is allocated to exactly one order." checked={draft.allowMultiOrderPayout} onChange={(v) => set("allowMultiOrderPayout", v)} />
          <ToggleRow label="Require a reference / attachment note" description="Payouts can't be saved without a reference (bank ref, bKash TrxID, statement no.)." checked={draft.requirePayoutReference} onChange={(v) => set("requirePayoutReference", v)} />
        </Divided>
        <p className="text-[12px]" style={{ color: "var(--text-faint)" }}>
          Only roles with the <b>Settlement</b> permission (Accounts, Admin) can add or edit settlement entries — set it under Users &amp; Roles.
        </p>
      </Section>

      {editing && (
        <CourierEditor
          key={editing === "new" ? "new" : editing.id}
          courier={editing === "new" ? null : editing}
          taken={draft.couriers.filter((c) => editing === "new" || c.id !== editing.id).map((c) => c.name)}
          onClose={() => setEditing(null)}
          onSave={(c) => {
            set("couriers", editing === "new" ? [...draft.couriers, c] : draft.couriers.map((x) => (x.id === c.id ? c : x)));
            setEditing(null);
          }}
        />
      )}
      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete courier"
        message={`Remove ${pendingDelete?.name}? Press Save afterwards to apply.`}
        confirmLabel="Delete"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) set("couriers", draft.couriers.filter((c) => c.id !== pendingDelete.id));
          setPendingDelete(null);
        }}
      />
    </FormShell>
  );
}

export default function Page() {
  return (
    <SettingsGate>
      <PageHeader title="Courier & Settlement" description="Courier master data, cost formulas and how payouts are tracked." back={{ href: "/settings", label: "Settings" }} />
      <div className="mt-5">
        <CourierForm />
      </div>
    </SettingsGate>
  );
}
