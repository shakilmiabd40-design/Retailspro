"use client";

import { useState } from "react";
import Link from "next/link";
import { useNotifications } from "@/lib/notifications/store";
import { useAccess } from "@/lib/settings/access";
import { useAudit } from "@/lib/settings/audit";
import { useToast } from "@/components/toast";
import { Divided, Field, FormShell, ListEditor, NumberInput, PageHeader, PrimaryButton, Section, SelectInput, SettingsGate, SoonTag, ToggleRow, useSectionForm } from "@/components/settings/ui";

function ReplenishmentCard() {
  const { settings, updateSettings } = useNotifications();
  const { can } = useAccess();
  const { log } = useAudit();
  const showToast = useToast();
  const [reorder, setReorder] = useState(settings.reorderPoint);
  const [emergency, setEmergency] = useState(settings.emergencyThreshold);
  const dirty = reorder !== settings.reorderPoint || emergency !== settings.emergencyThreshold;
  const invalid = emergency > reorder;
  const canEdit = can("settings", "edit");

  return (
    <Section
      title="Replenishment alerts"
      description={
        <>
          Drives the stock notifications (Replenish / Critical). Stored with the notification engine — fine-tune escalation and routing in{" "}
          <Link href="/notifications/settings" className="underline" style={{ color: "var(--brand-strong)" }}>
            Notifications → Thresholds &amp; routing
          </Link>
          .
        </>
      }
    >
      <fieldset disabled={!canEdit} className="min-w-0 space-y-4 border-0 p-0">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Default reorder level (global)" hint="At or below this many available units, start replenishing.">
            <NumberInput value={reorder} onChange={setReorder} />
          </Field>
          <Field label="Critical alert threshold" hint="At or below this, treat the item as critical.">
            <NumberInput value={emergency} onChange={setEmergency} />
          </Field>
        </div>
        {invalid && (
          <p className="text-[12.5px]" style={{ color: "var(--red)" }}>
            The critical threshold can&apos;t be higher than the reorder level.
          </p>
        )}
        <div className="flex justify-end">
          <PrimaryButton
            disabled={!dirty || invalid}
            onClick={() => {
              log({ module: "Settings", action: "edit", entity: "Replenishment alerts", summary: "Changed reorder level / critical threshold", before: { reorderPoint: settings.reorderPoint, emergencyThreshold: settings.emergencyThreshold }, after: { reorderPoint: reorder, emergencyThreshold: emergency } });
              updateSettings({ reorderPoint: reorder, emergencyThreshold: emergency });
              showToast("Replenishment thresholds saved");
            }}
          >
            Save thresholds
          </PrimaryButton>
        </div>
      </fieldset>
    </Section>
  );
}

function InventoryForm() {
  const form = useSectionForm("inventory");
  const { draft, set } = form;

  return (
    <div className="space-y-5">
      <FormShell form={form} onSave={() => (draft.lowStockThreshold < 0 ? "Low stock threshold can't be negative." : null)}>
        <Section title="Stock rules">
          <Divided>
            <ToggleRow label="Track inventory" description="Keep on-hand and reserved counts for every variant." checked={draft.trackInventory} onChange={(v) => set("trackInventory", v)} soon />
            <ToggleRow label="Allow negative stock" description="Let orders go through when available stock is zero. Recommended: off." checked={draft.allowNegativeStock} onChange={(v) => set("allowNegativeStock", v)} soon />
            <div className="flex flex-wrap items-center justify-between gap-4 py-3">
              <div>
                <p className="flex items-center gap-2 text-[13px] font-medium" style={{ color: "var(--text)" }}>
                  Reserve stock on <SoonTag />
                </p>
                <p className="mt-0.5 text-[12px]" style={{ color: "var(--text-muted)" }}>
                  Orders currently reserve stock the moment they are created (Pending).
                </p>
              </div>
              <div className="w-44">
                <SelectInput value={draft.reserveStockOn} onChange={(v) => set("reserveStockOn", v)} options={[{ value: "pending", label: "Pending" }, { value: "processing", label: "Processing" }]} />
              </div>
            </div>
          </Divided>
          <div>
            <p className="mb-2 text-[13px] font-medium" style={{ color: "var(--text)" }}>
              Stock adjustment reasons
            </p>
            <ListEditor items={draft.adjustmentReasons} onChange={(v) => set("adjustmentReasons", v)} placeholder="e.g. Returned to supplier" />
          </div>
        </Section>

        <Section title="Low stock" description="Variants at or below the threshold show a “Low stock” badge in Products and Reports.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Low stock badge threshold (units)">
              <NumberInput value={draft.lowStockThreshold} onChange={(v) => set("lowStockThreshold", v)} />
            </Field>
          </div>
          <Divided>
            <ToggleRow label="Low stock report" description="Include the low-stock breakdown in inventory reports." checked={draft.lowStockReportEnabled} onChange={(v) => set("lowStockReportEnabled", v)} soon />
          </Divided>
        </Section>

        <Section title="Stock update controls" description={<>Who may run Bulk Stock Update is set by the <b>Inventory → Edit</b> permission under <Link href="/settings/users/roles" className="underline" style={{ color: "var(--brand-strong)" }}>Users &amp; Roles</Link>.</>}>
          <Divided>
            <ToggleRow label="Stock change requires a reason" description="Bulk Stock Update asks for one of the adjustment reasons above and records it in the audit log." checked={draft.stockChangeRequiresReason} onChange={(v) => set("stockChangeRequiresReason", v)} />
            <ToggleRow label="Stock change requires approval" description="A second person approves stock adjustments before they apply." checked={draft.stockChangeRequiresApproval} onChange={(v) => set("stockChangeRequiresApproval", v)} soon />
          </Divided>
        </Section>
      </FormShell>
      <ReplenishmentCard />
    </div>
  );
}

export default function Page() {
  return (
    <SettingsGate>
      <PageHeader title="Inventory Settings" description="Stock rules, alert thresholds and stock-change controls." back={{ href: "/settings", label: "Settings" }} />
      <div className="mt-5">
        <InventoryForm />
      </div>
    </SettingsGate>
  );
}
