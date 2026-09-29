"use client";

import { useState } from "react";
import { X, AlertTriangle } from "lucide-react";
import { useOrders } from "@/lib/orders/store";
import { useToast } from "@/components/toast";
import { cancelReasonLabel, expectedCod, totalItemQty } from "@/lib/orders/utils";
import { useSettings } from "@/lib/settings/store";
import { formatTaka } from "@/lib/products/utils";
import type { Order } from "@/lib/orders/types";

export function CancelOrderModal({
  order,
  open,
  onClose,
  onCancelled,
}: {
  order: Order | null;
  open: boolean;
  onClose: () => void;
  onCancelled?: () => void;
}) {
  const { cancelOrder } = useOrders();
  const showToast = useToast();
  const { settings } = useSettings();
  const reasons = settings.orders.cancelReasons;
  const [picked, setPicked] = useState("");
  const [notes, setNotes] = useState("");
  const reason = reasons.includes(picked) ? picked : (reasons[0] ?? "Other");
  const noteRequired = settings.orders.requireCancelNote;

  if (!open || !order) return null;

  function handleConfirm() {
    if (!order) return;
    if (noteRequired && !notes.trim()) {
      showToast("Please add a note explaining the cancellation", "error");
      return;
    }
    const result = cancelOrder(order.id, { reason, notes });
    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    showToast(`Order #${order.orderNumber} cancelled`);
    onClose();
    onCancelled?.();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div className="card flex max-h-[85vh] w-full max-w-md flex-col p-5">
        <div className="mb-3 flex items-start justify-between">
          <p className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>
            Cancel Order #{order.orderNumber}?
          </p>
          <button onClick={onClose} className="focus-ring rounded-md p-1" style={{ color: "var(--text-faint)" }}>
            <X size={18} />
          </button>
        </div>

        <div
          className="mb-4 space-y-1.5 rounded-xl border p-3 text-[12.5px]"
          style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
        >
          <div className="flex items-center justify-between">
            <span style={{ color: "var(--text-muted)" }}>Stock</span>
            <span style={{ color: "var(--text)" }}>{totalItemQty(order)} item(s) will be released</span>
          </div>
          <div className="flex items-center justify-between">
            <span style={{ color: "var(--text-muted)" }}>Revenue</span>
            <span style={{ color: "var(--text)" }}>{formatTaka(expectedCod(order), 2)} will be excluded</span>
          </div>
          <div className="flex items-center justify-between">
            <span style={{ color: "var(--text-muted)" }}>Courier Cost</span>
            <span style={{ color: "var(--text)" }}>৳0</span>
          </div>
          <div className="flex items-center justify-between">
            <span style={{ color: "var(--text-muted)" }}>Financial Loss</span>
            <span style={{ color: "var(--text)" }}>৳0</span>
          </div>
        </div>

        <label className="mb-3 block">
          <span className="mb-1.5 block text-[12.5px] font-medium" style={{ color: "var(--text-muted)" }}>
            Cancel Reason
          </span>
          <select
            value={reason}
            onChange={(e) => setPicked(e.target.value)}
            className="focus-ring w-full rounded-xl border px-3 py-2 text-[13px]"
            style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
          >
            {reasons.map((r) => (
              <option key={r} value={r}>
                {cancelReasonLabel(r)}
              </option>
            ))}
          </select>
        </label>

        <label className="mb-4 block">
          <span className="mb-1.5 block text-[12.5px] font-medium" style={{ color: "var(--text-muted)" }}>
            Notes{noteRequired ? " (required)" : " — optional"}
          </span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Any extra context..."
            className="focus-ring w-full rounded-xl border px-3 py-2 text-[13px]"
            style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
          />
        </label>

        <div
          className="mb-4 flex items-start gap-2 rounded-xl border p-3 text-[12px]"
          style={{ borderColor: "var(--brand-tint-border)", background: "var(--brand-tint-bg)", color: "var(--text-muted)" }}
        >
          <AlertTriangle size={14} className="mt-0.5 shrink-0" style={{ color: "var(--brand)" }} />
          This order will be kept as a historical record, just excluded from active sales and courier totals.
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="focus-ring rounded-lg border px-4 py-2 text-[13px] font-medium"
            style={{ borderColor: "var(--border)", color: "var(--text)" }}
          >
            Keep Order
          </button>
          <button
            onClick={handleConfirm}
            className="focus-ring rounded-lg px-4 py-2 text-[13px] font-semibold text-white"
            style={{ background: "var(--red)" }}
          >
            Confirm Cancel Order
          </button>
        </div>
      </div>
    </div>
  );
}
