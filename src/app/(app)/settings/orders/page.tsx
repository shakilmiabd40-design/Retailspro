"use client";

import { ORDER_STATUS_LABELS } from "@/lib/orders/utils";
import type { OrderStatus } from "@/lib/orders/types";
import type { CancellableStatus } from "@/lib/settings/types";
import { OrderStatusBadge } from "@/components/orders/status-badge";
import { Divided, Field, FormShell, ListEditor, LockedTag, NumberInput, PageHeader, Section, SettingsGate, ToggleRow, useSectionForm } from "@/components/settings/ui";

const STATUS_FLOW: OrderStatus[] = ["pending", "processing", "in_transit", "delivered", "partial_delivered", "refuse_return", "cancelled"];
const CANCELLABLE: { key: CancellableStatus; label: string }[] = [
  { key: "pending", label: ORDER_STATUS_LABELS.pending },
  { key: "processing", label: ORDER_STATUS_LABELS.processing },
];

function OrdersForm() {
  const form = useSectionForm("orders");
  const { draft, set } = form;

  function toggleCancellable(k: CancellableStatus, on: boolean) {
    set("cancelAllowedStatuses", on ? [...new Set([...draft.cancelAllowedStatuses, k])] : draft.cancelAllowedStatuses.filter((s) => s !== k));
  }

  return (
    <FormShell
      form={form}
      onSave={() =>
        draft.cancelReasons.length === 0
          ? "Keep at least one cancel reason."
          : draft.insideCityCharge < 0 || draft.subCityCharge < 0 || draft.outsideCityCharge < 0
            ? "Delivery charges can't be negative."
            : null
      }
    >
      <Section title="Order workflow" description="New orders always start as Pending. The statuses and their order are fixed so reports and stock rules stay consistent.">
        <div className="flex flex-wrap items-center gap-2">
          {STATUS_FLOW.map((s, i) => (
            <span key={s} className="flex items-center gap-2">
              <OrderStatusBadge status={s} />
              {i < 3 && <span style={{ color: "var(--text-faint)" }}>→</span>}
              {i === 3 && <span style={{ color: "var(--text-faint)" }}>/</span>}
            </span>
          ))}
        </div>
        <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          Pending → Processing → In Transit → Delivered / Partial Delivered / Refuse Return. Cancelled branches off before the parcel reaches the courier.
        </p>
        <LockedTag>Read-only</LockedTag>
      </Section>

      <Section title="Cancel rules">
        <div>
          <p className="mb-2 text-[13px] font-medium" style={{ color: "var(--text)" }}>
            Cancel allowed while the order is
          </p>
          <div className="flex flex-wrap gap-4">
            {CANCELLABLE.map((c) => (
              <label key={c.key} className="flex cursor-pointer items-center gap-2 text-[13px]" style={{ color: "var(--text)" }}>
                <input type="checkbox" className="h-4 w-4 accent-[var(--brand)]" checked={draft.cancelAllowedStatuses.includes(c.key)} onChange={(e) => toggleCancellable(c.key, e.target.checked)} />
                {c.label}
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-[11.5px]" style={{ color: "var(--text-faint)" }}>
            Once an order is In Transit it can&apos;t be cancelled — the parcel has already left.
          </p>
        </div>
        <Divided>
          <ToggleRow label="Require a note when cancelling" checked={draft.requireCancelNote} onChange={(v) => set("requireCancelNote", v)} />
        </Divided>
        <div>
          <p className="mb-2 text-[13px] font-medium" style={{ color: "var(--text)" }}>
            Cancel reasons
          </p>
          <ListEditor items={draft.cancelReasons} onChange={(v) => set("cancelReasons", v)} placeholder="e.g. Price too high" />
        </div>
      </Section>

      <Section title="Customer delivery charge" description="Suggested when creating an order. Staff can still override the amount.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Inside city (৳)">
            <NumberInput value={draft.insideCityCharge} onChange={(v) => set("insideCityCharge", v)} />
          </Field>
          <Field label="Dhaka Sub (৳)">
            <NumberInput value={draft.subCityCharge} onChange={(v) => set("subCityCharge", v)} />
          </Field>
          <Field label="Outside city (৳)">
            <NumberInput value={draft.outsideCityCharge} onChange={(v) => set("outsideCityCharge", v)} />
          </Field>
        </div>
        <Divided>
          <ToggleRow label="Free delivery rule" description="Offer a “Free” one-click option on the order form when the discounted subtotal reaches the minimum." checked={draft.freeDeliveryEnabled} onChange={(v) => set("freeDeliveryEnabled", v)} />
        </Divided>
        {draft.freeDeliveryEnabled && (
          <div className="max-w-xs">
            <Field label="Minimum subtotal for free delivery (৳)">
              <NumberInput value={draft.freeDeliveryMinSubtotal} onChange={(v) => set("freeDeliveryMinSubtotal", v)} />
            </Field>
          </div>
        )}
      </Section>

      <Section title="Returns on Partial Delivered / Refuse Return">
        <Divided>
          <ToggleRow
            label="“Return Received” is mandatory"
            description="On: the parcel must be marked received before its stock is released. Off: stock is released as soon as the outcome is recorded and no return tracking is needed."
            checked={draft.returnReceivedMandatory}
            onChange={(v) => set("returnReceivedMandatory", v)}
          />
          <ToggleRow label="Return received required before stock restore" description="Stock only goes back on the shelf once the parcel is physically back." checked locked />
        </Divided>
      </Section>
    </FormShell>
  );
}

export default function Page() {
  return (
    <SettingsGate>
      <PageHeader title="Orders Settings" description="Workflow rules, cancellation, delivery charge defaults and return handling." back={{ href: "/settings", label: "Settings" }} />
      <div className="mt-5">
        <OrdersForm />
      </div>
    </SettingsGate>
  );
}
