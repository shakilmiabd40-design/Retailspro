"use client";

import { useMemo, type ReactNode } from "react";
import { Printer, RotateCcw } from "lucide-react";
import { useOrders } from "@/lib/orders/store";
import { useProducts } from "@/lib/products/store";
import { useSuppliers } from "@/lib/suppliers/store";
import { ORDER_STATUS_LABELS } from "@/lib/orders/utils";
import { uniqueCouriers } from "@/lib/reports/orders";
import { DATE_TYPE_LABELS, PRESETS, presetRange, type DateTypeKey, type GroupBy, type SettlementLabel } from "@/lib/reports/dates";
import type { ReportFilterState } from "@/lib/reports/use-filters";
import type { OrderStatus } from "@/lib/orders/types";

const inputStyle = { borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" };
const inputClass = "focus-ring w-full rounded-xl border px-3 py-2 text-[13px]";

export interface FilterBarProps {
  state: ReportFilterState;
  /** Date types offered for this report; the first is the default. Omit for snapshot reports (no date range). */
  dateTypes?: DateTypeKey[];
  statusOptions?: OrderStatus[];
  courier?: boolean;
  supplier?: boolean;
  product?: boolean;
  settlement?: boolean;
  groupBy?: boolean;
  /** Report-specific controls (rendered inside the same bar). */
  extra?: ReactNode;
  /** Called when the date type changes (e.g. to keep tabs in sync). */
  onDateTypeChange?: (t: DateTypeKey) => void;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[11.5px] font-medium" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

const GROUPS: { key: GroupBy; label: string }[] = [
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
];

export function FilterBar({ state, dateTypes, statusOptions, courier, supplier, product, settlement, groupBy, extra, onDateTypeChange }: FilterBarProps) {
  const { orders } = useOrders();
  const { products } = useProducts();
  const { suppliers } = useSuppliers();
  const { draft, applied, setDraft, applyPatch, apply, reset, dirty } = state;

  const couriers = useMemo(() => uniqueCouriers(orders), [orders]);
  const categories = useMemo(() => [...new Set(products.map((p) => p.category).filter(Boolean))].sort(), [products]);
  const brands = useMemo(() => [...new Set(products.map((p) => p.brand).filter(Boolean))].sort(), [products]);

  const invalidRange = !!dateTypes && !!draft.from && !!draft.to && draft.from > draft.to;

  return (
    <div className="card no-print space-y-4 p-4">
      {dateTypes && (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => applyPatch({ ...presetRange(p.key), preset: p.key })}
                className="focus-ring rounded-full border px-3 py-1 text-[12px] font-medium transition-colors"
                style={{
                  borderColor: applied.preset === p.key ? "var(--brand)" : "var(--border)",
                  background: applied.preset === p.key ? "var(--brand-soft)" : "transparent",
                  color: applied.preset === p.key ? "var(--brand)" : "var(--text-muted)",
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Field label="From date">
              <input type="date" value={draft.from} onChange={(e) => setDraft({ from: e.target.value, preset: "custom" })} className={inputClass} style={inputStyle} />
            </Field>
            <Field label="To date">
              <input type="date" value={draft.to} onChange={(e) => setDraft({ to: e.target.value, preset: "custom" })} className={inputClass} style={inputStyle} />
            </Field>
            <div className="col-span-2">
              <Field label="Date type">
                <select
                  value={draft.dateType}
                  onChange={(e) => {
                    setDraft({ dateType: e.target.value as DateTypeKey });
                    onDateTypeChange?.(e.target.value as DateTypeKey);
                  }}
                  className={inputClass}
                  style={inputStyle}
                >
                  {dateTypes.map((t) => (
                    <option key={t} value={t}>
                      {DATE_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </div>
        </>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {statusOptions && (
          <Field label="Order status">
            <select value={draft.status} onChange={(e) => setDraft({ status: e.target.value })} className={inputClass} style={inputStyle}>
              <option value="all">All statuses</option>
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {ORDER_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </Field>
        )}
        {courier && (
          <Field label="Courier company">
            <select value={draft.courier} onChange={(e) => setDraft({ courier: e.target.value })} className={inputClass} style={inputStyle}>
              <option value="all">All couriers</option>
              {couriers.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
        )}
        {supplier && (
          <Field label="Supplier">
            <select value={draft.supplierId} onChange={(e) => setDraft({ supplierId: e.target.value })} className={inputClass} style={inputStyle}>
              <option value="all">All suppliers</option>
              {suppliers.filter((s) => !s.archived).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        {settlement && (
          <Field label="Settlement status">
            <select value={draft.settlementStatus} onChange={(e) => setDraft({ settlementStatus: e.target.value as SettlementLabel | "all" })} className={inputClass} style={inputStyle}>
              <option value="all">All</option>
              <option value="Unsettled">Unsettled</option>
              <option value="Partially Settled">Partially Settled</option>
              <option value="Settled">Settled</option>
            </select>
          </Field>
        )}
        {product && (
          <>
            <Field label="Category">
              <select value={draft.category} onChange={(e) => setDraft({ category: e.target.value })} className={inputClass} style={inputStyle}>
                <option value="all">All categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Brand">
              <select value={draft.brand} onChange={(e) => setDraft({ brand: e.target.value })} className={inputClass} style={inputStyle}>
                <option value="all">All brands</option>
                {brands.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Product">
              <select value={draft.productId} onChange={(e) => setDraft({ productId: e.target.value })} className={inputClass} style={inputStyle}>
                <option value="all">All products</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="SKU contains">
              <input value={draft.sku} onChange={(e) => setDraft({ sku: e.target.value })} placeholder="e.g. NK-AM270" className={inputClass} style={inputStyle} />
            </Field>
          </>
        )}
        {extra}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        {groupBy && dateTypes ? (
          <div>
            <span className="mb-1 block text-[11.5px] font-medium" style={{ color: "var(--text-muted)" }}>
              Group by
            </span>
            <div className="flex gap-1 rounded-lg p-1" style={{ background: "var(--surface-2)" }}>
              {GROUPS.map((g) => (
                <button
                  key={g.key}
                  onClick={() => setDraft({ groupBy: g.key })}
                  className="focus-ring rounded-md px-3 py-1 text-[12px] font-medium"
                  style={{ background: draft.groupBy === g.key ? "var(--brand)" : "transparent", color: draft.groupBy === g.key ? "#fff" : "var(--text-muted)" }}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <span />
        )}

        <div className="flex flex-wrap items-center gap-2">
          {invalidRange && (
            <span className="text-[12px]" style={{ color: "var(--red)" }}>
              From date is after To date.
            </span>
          )}
          <button onClick={() => window.print()} className="focus-ring flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-[13px] font-medium" style={{ borderColor: "var(--border)", color: "var(--text)" }}>
            <Printer size={14} />
            Print
          </button>
          <button onClick={reset} className="focus-ring flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-[13px] font-medium" style={{ borderColor: "var(--border)", color: "var(--text)" }}>
            <RotateCcw size={14} />
            Reset
          </button>
          <button
            onClick={apply}
            disabled={invalidRange}
            className="focus-ring rounded-xl px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-40"
            style={{ background: "var(--brand)", boxShadow: dirty ? "0 0 0 3px var(--brand-soft)" : undefined }}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
