"use client";

import { useMemo, useState } from "react";
import { useSettings } from "@/lib/settings/store";
import { X } from "lucide-react";
import { useSettlements } from "@/lib/settlements/store";
import type { SettlementRow } from "@/lib/settlements/compute";
import { finalStatusDate } from "@/lib/reports/orders";
import { taka, ymd } from "@/lib/reports/format";
import { useToast } from "@/components/toast";

const inputStyle = { borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" };
const inputClass = "focus-ring w-full rounded-xl border px-3 py-2 text-[13px]";

function Shell({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4" style={{ background: "rgba(0,0,0,0.5)" }} role="dialog" aria-modal="true" aria-label={title}>
      <div className={`card my-auto w-full ${wide ? "max-w-2xl" : "max-w-md"} p-5`}>
        <div className="mb-4 flex items-center justify-between">
          <p className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>
            {title}
          </p>
          <button onClick={onClose} aria-label="Close" className="focus-ring rounded-md p-1" style={{ color: "var(--text-faint)" }}>
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12.5px] font-medium" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

// ---- record a courier payout -----------------------------------------------------

export function RecordPayoutModal({ onClose }: { onClose: () => void }) {
  const { rows, recordPayout } = useSettlements();
  const { settings } = useSettings();
  const { allowMultiOrderPayout, requirePayoutReference } = settings.courier;
  const showToast = useToast();

  const couriersWithPending = useMemo(() => [...new Set(rows.filter((r) => r.pending > 0).map((r) => r.order.courier.company))].sort(), [rows]);
  const [courier, setCourier] = useState(couriersWithPending[0] ?? "");
  const [amount, setAmount] = useState(0);
  const [paidDate, setPaidDate] = useState(() => ymd(new Date()));
  const [reference, setReference] = useState("");
  const [alloc, setAlloc] = useState<Record<string, number>>({});

  const candidates = useMemo(
    () =>
      rows
        .filter((r) => r.order.courier.company === courier && r.pending > 0)
        .sort((a, b) => (finalStatusDate(a.order)?.getTime() ?? 0) - (finalStatusDate(b.order)?.getTime() ?? 0)),
    [rows, courier]
  );

  const allocated = Object.values(alloc).reduce((s, v) => s + (v || 0), 0);
  const remaining = amount - allocated;

  function autoAllocate() {
    let left = amount;
    const next: Record<string, number> = {};
    for (const r of allowMultiOrderPayout ? candidates : candidates.slice(0, 1)) {
      if (left <= 0) break;
      const take = Math.min(left, r.pending);
      next[r.order.id] = take;
      left -= take;
    }
    setAlloc(next);
  }

  function save() {
    if (requirePayoutReference && !reference.trim()) {
      showToast("A reference is required for every payout (Settings → Courier & Settlement)", "error");
      return;
    }
    if (!allowMultiOrderPayout && Object.values(alloc).filter((v) => v > 0).length > 1) {
      showToast("A payout can only be allocated to one order (Settings → Courier & Settlement)", "error");
      return;
    }
    const result = recordPayout({
      courier,
      amount,
      paidDate,
      reference,
      allocations: Object.entries(alloc).map(([orderId, a]) => ({ orderId, amount: a })),
    });
    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    showToast(`Payout ${result.payout.payoutNumber} recorded`);
    onClose();
  }

  return (
    <Shell title="Record courier payout" onClose={onClose} wide>
      {couriersWithPending.length === 0 ? (
        <p className="py-8 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>
          No orders are waiting for a courier payout right now.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Courier company">
              <select
                value={courier}
                onChange={(e) => {
                  setCourier(e.target.value);
                  setAlloc({});
                }}
                className={inputClass}
                style={inputStyle}
              >
                {couriersWithPending.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Paid amount (৳)">
              <input type="number" min={0} value={amount || ""} onChange={(e) => setAmount(Number(e.target.value))} className={inputClass} style={inputStyle} />
            </Field>
            <Field label="Paid date">
              <input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} className={inputClass} style={inputStyle} />
            </Field>
            <Field label={requirePayoutReference ? "Reference note (required)" : "Reference note"}>
              <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Payment slip, bKash / bank ref" className={inputClass} style={inputStyle} />
            </Field>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[13px] font-medium" style={{ color: "var(--text)" }}>
                Allocate to orders
              </p>
              <button onClick={autoAllocate} disabled={!(amount > 0)} className="focus-ring rounded-lg border px-2.5 py-1 text-[12px] font-medium disabled:opacity-40" style={{ borderColor: "var(--border)", color: "var(--text)" }}>
                Auto-allocate oldest first
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
              <table className="w-full border-collapse text-left text-[12.5px]">
                <thead>
                  <tr style={{ background: "var(--surface-2)", color: "var(--text-faint)" }}>
                    <th className="px-3 py-2 font-medium">Order</th>
                    <th className="px-3 py-2 text-right font-medium">Expected</th>
                    <th className="px-3 py-2 text-right font-medium">Pending</th>
                    <th className="px-3 py-2 text-right font-medium">Allocate</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((r) => (
                    <tr key={r.order.id} className="border-t" style={{ borderColor: "var(--border-soft)" }}>
                      <td className="px-3 py-2" style={{ color: "var(--text)" }}>
                        #{r.order.orderNumber}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                        {taka(r.expected)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text)" }}>
                        {taka(r.pending)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          min={0}
                          max={r.pending}
                          value={alloc[r.order.id] || ""}
                          onChange={(e) => {
                            const v = Math.min(r.pending, Math.max(0, Number(e.target.value)));
                            setAlloc((prev) => (allowMultiOrderPayout ? { ...prev, [r.order.id]: v } : { [r.order.id]: v }));
                          }}
                          className="w-24 rounded-lg border px-2 py-1 text-right"
                          style={inputStyle}
                          aria-label={`Allocate to order ${r.order.orderNumber}`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[12.5px]" style={{ color: remaining < 0 ? "var(--red)" : "var(--text-muted)" }}>
              {!allowMultiOrderPayout && <span style={{ color: "var(--text-faint)" }}>One order per payout. </span>}
              Allocated {taka(allocated)} of {taka(amount)}
              {remaining > 0 ? ` · ${taka(remaining)} unallocated` : remaining < 0 ? ` · ${taka(-remaining)} over the paid amount` : ""}
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="focus-ring rounded-xl border px-4 py-2 text-[13px] font-medium" style={{ borderColor: "var(--border)", color: "var(--text)" }}>
              Cancel
            </button>
            <button onClick={save} disabled={remaining < 0 || allocated <= 0 || !(amount > 0)} className="focus-ring rounded-xl px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-40" style={{ background: "var(--brand)" }}>
              Save payout
            </button>
          </div>
        </div>
      )}
    </Shell>
  );
}

// ---- adjust one order's expected settlement ------------------------------------------

export function EditExpectedModal({ row, onClose }: { row: SettlementRow; onClose: () => void }) {
  const { setOverride } = useSettlements();
  const manualMode = useSettings().settings.courier.settlementMode === "manual";
  const showToast = useToast();
  const [expected, setExpected] = useState(String(row.expected));
  const [note, setNote] = useState(row.note ?? "");

  function save() {
    const n = Number(expected);
    if (expected.trim() === "" || !Number.isFinite(n) || n < 0) {
      showToast("Enter an amount of 0 or more", "error");
      return;
    }
    // Same as the calculated figure → no override needed, but keep the note.
    setOverride(row.order.id, { expected: !manualMode && Math.abs(n - row.policyExpected) < 0.005 ? undefined : n, note });
    showToast("Settlement updated");
    onClose();
  }

  return (
    <Shell title={`Settlement · #${row.order.orderNumber}`} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
          Calculated expected amount: <b style={{ color: "var(--text)" }}>{taka(row.policyExpected)}</b> (collected − courier cost). Change it if this courier pays differently.
        </p>
        <Field label="Expected settlement (৳)">
          <input type="number" min={0} value={expected} onChange={(e) => setExpected(e.target.value)} className={inputClass} style={inputStyle} />
        </Field>
        <Field label="Note">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why it differs, or anything to remember" className={inputClass} style={inputStyle} />
        </Field>
        <div className="flex flex-wrap justify-between gap-2">
          <button
            onClick={() => {
              setOverride(row.order.id, null);
              showToast("Reset to the calculated amount");
              onClose();
            }}
            disabled={!row.overridden && !row.note}
            className="focus-ring rounded-xl border px-3.5 py-2 text-[13px] font-medium disabled:opacity-40"
            style={{ borderColor: "var(--border)", color: "var(--text)" }}
          >
            Use calculated amount
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="focus-ring rounded-xl border px-4 py-2 text-[13px] font-medium" style={{ borderColor: "var(--border)", color: "var(--text)" }}>
              Cancel
            </button>
            <button onClick={save} className="focus-ring rounded-xl px-4 py-2 text-[13px] font-semibold text-white" style={{ background: "var(--brand)" }}>
              Save
            </button>
          </div>
        </div>
      </div>
    </Shell>
  );
}
