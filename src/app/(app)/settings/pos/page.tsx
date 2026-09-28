"use client";

import { Divided, Field, FormShell, NumberInput, PageHeader, Section, SelectInput, SettingsGate, Tag, TextInput, ToggleRow, useSectionForm } from "@/components/settings/ui";
import { useAccess } from "@/lib/settings/access";
import type { PosPaymentMethodKey } from "@/lib/settings/types";

const areaClass = "focus-ring w-full rounded-xl border px-3 py-2 text-[13px]";
const areaStyle = { borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" } as const;

function PosForm() {
  const form = useSectionForm("pos");
  const { draft, set } = form;
  const { roles } = useAccess();

  const setRoleCap = (roleId: string, v: number) => set("maxDiscountByRole", { ...draft.maxDiscountByRole, [roleId]: v });

  return (
    <FormShell
      form={form}
      onSave={() => {
        if (draft.vatPercent < 0 || draft.vatPercent > 100) return "VAT must be between 0 and 100.";
        if ([draft.defaultMaxDiscountPct, ...Object.values(draft.maxDiscountByRole)].some((n) => n < 0 || n > 100)) return "Discount limits must be between 0 and 100.";
        return null;
      }}
    >
      <Section title="Selling" description="How the New Sale screen behaves.">
        <Divided>
          <ToggleRow label="Barcode scanning" description="A scan (or an exact barcode / SKU typed and confirmed with Enter) puts the item straight into the cart. Off, the search box only searches." checked={draft.enableBarcodeScan} onChange={(v) => set("enableBarcodeScan", v)} />
          <ToggleRow label="Allow split payment" description="Let a customer pay one sale with more than one method — e.g. part cash, part card." checked={draft.allowSplitPayment} onChange={(v) => set("allowSplitPayment", v)} />
          <ToggleRow label="Require customer phone for warranty" description="Every walk-in sale creates warranties. When on, a sale can't be completed without a phone number, so each warranty can be found by it." checked={draft.requirePhoneForWarranty} onChange={(v) => set("requirePhoneForWarranty", v)} />
        </Divided>
        <Field label="Default payment method">
          <SelectInput<PosPaymentMethodKey>
            value={draft.defaultPaymentMethod}
            onChange={(v) => set("defaultPaymentMethod", v)}
            options={[
              { value: "cash", label: "Cash" },
              { value: "card", label: "Card" },
              { value: "mobile_banking", label: "Mobile banking" },
            ]}
          />
        </Field>
        <Field label="VAT / tax rate (%)" hint="0 means VAT isn't used. When set, it is added on top of walk-in sales after discounts. Delivery orders go through Orders, which has no tax line, so VAT isn't added to them.">
          <NumberInput value={draft.vatPercent} min={0} max={100} step={0.5} onChange={(v) => set("vatPercent", v)} />
        </Field>
      </Section>

      <Section title="Discount limits" description="The most a person can discount one sale (as a % of the subtotal), by role. Anyone with POS → “Edit” (override limits), and Super Admin, can go beyond it. Every discount change is written to the audit log.">
        <div className="card divide-y" style={{ borderColor: "var(--border-soft)" }}>
          {roles.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5" style={{ borderColor: "var(--border-soft)" }}>
              <span className="text-[13px] font-medium" style={{ color: "var(--text)" }}>
                {r.name}
                {r.locked && (
                  <span className="ml-2">
                    <Tag tone="muted">Unlimited</Tag>
                  </span>
                )}
              </span>
              {!r.locked && (
                <span className="flex items-center gap-1.5">
                  <NumberInput value={draft.maxDiscountByRole[r.id] ?? draft.defaultMaxDiscountPct} min={0} max={100} step={1} onChange={(v) => setRoleCap(r.id, v)} className="w-20" aria-label={`${r.name} discount limit`} />
                  <span className="text-[13px]" style={{ color: "var(--text-muted)" }}>
                    %
                  </span>
                </span>
              )}
            </div>
          ))}
        </div>
        <Field label="Limit for roles not listed above" hint="Applies to any role created later.">
          <NumberInput value={draft.defaultMaxDiscountPct} min={0} max={100} step={1} onChange={(v) => set("defaultMaxDiscountPct", v)} />
        </Field>
      </Section>

      <Section title="Returns & exchanges">
        <Field label="Return window (days)" hint="How long after a sale a return is accepted. 0 = no limit. People with POS → “Edit” can still take back a late return.">
          <NumberInput value={draft.returnWindowDays} min={0} max={3650} step={1} onChange={(v) => set("returnWindowDays", Math.round(v))} />
        </Field>
      </Section>

      <Section title="Receipt" description="Printed on the 80 mm receipt. The shop name, address and phone come from Company / Shop.">
        <Field label="Header text" hint="Optional line under the shop details.">
          <TextInput value={draft.receiptHeader} onChange={(e) => set("receiptHeader", e.target.value)} maxLength={120} />
        </Field>
        <Field label="Return policy text">
          <textarea value={draft.returnPolicyText} onChange={(e) => set("returnPolicyText", e.target.value)} rows={3} maxLength={300} className={areaClass} style={areaStyle} />
        </Field>
        <Field label="Footer text">
          <textarea value={draft.receiptFooter} onChange={(e) => set("receiptFooter", e.target.value)} rows={2} maxLength={200} className={areaClass} style={areaStyle} />
        </Field>
        <Divided>
          <ToggleRow label="Show warranty end date" description="Adds “Warranty valid until …” to walk-in receipts." checked={draft.showWarrantyOnReceipt} onChange={(v) => set("showWarrantyOnReceipt", v)} />
        </Divided>
      </Section>

      <Section title="Who can do what" description="Set in Users & Roles → the POS row of the permission matrix.">
        <ul className="space-y-1.5 text-[13px]" style={{ color: "var(--text-muted)" }}>
          <li><b style={{ color: "var(--text)" }}>Create</b> — sell, hold sales, open and close their own session, move petty cash.</li>
          <li><b style={{ color: "var(--text)" }}>Edit</b> — override the discount limit and the return window.</li>
          <li><b style={{ color: "var(--text)" }}>Delete</b> — void a completed sale.</li>
          <li><b style={{ color: "var(--text)" }}>Approve</b> — process returns and exchanges.</li>
          <li><b style={{ color: "var(--text)" }}>Export</b> — download POS reports.</li>
          <li><b style={{ color: "var(--text)" }}>Financial</b> — see every cashier&apos;s session cash, close other people&apos;s sessions, and see profit.</li>
        </ul>
      </Section>
    </FormShell>
  );
}

export default function Page() {
  return (
    <SettingsGate>
      <PageHeader title="POS Settings" description="Barcode scanning, payments, discount limits, VAT, returns and the receipt." back={{ href: "/settings", label: "Settings" }} />
      <div className="mt-5">
        <PosForm />
      </div>
    </SettingsGate>
  );
}
