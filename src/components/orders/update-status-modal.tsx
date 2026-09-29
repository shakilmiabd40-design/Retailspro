"use client";

import { useEffect, useState } from "react";
import { X, Truck, PackageCheck, PackageX, RotateCcw } from "lucide-react";
import clsx from "clsx";
import { useOrders } from "@/lib/orders/store";
import { useToast } from "@/components/toast";
import { useSettings } from "@/lib/settings/store";
import { actualCourierCost, expectedCod } from "@/lib/orders/utils";
import { formatTaka } from "@/lib/products/utils";
import type { Order, SettlementStatus } from "@/lib/orders/types";

type Outcome = "delivered" | "partial" | "refuse";

const inputStyle = { borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" };
const inputClass = "focus-ring w-full rounded-xl border px-3 py-2 text-[13px]";

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

export function UpdateStatusModal({
  order,
  open,
  onClose,
}: {
  order: Order | null;
  open: boolean;
  onClose: () => void;
}) {
  const { markProcessing, dispatchOrder, markDelivered, markPartialDelivered, markRefuseReturn } = useOrders();
  const showToast = useToast();

  const { settings } = useSettings();
  const couriers = settings.courier.couriers.filter((c) => c.status === "active");
  const [company, setCompany] = useState("");
  const [trackingId, setTrackingId] = useState("");
  const [dispatchDate, setDispatchDate] = useState("");
  const [forwardCost, setForwardCost] = useState(0);

  const [outcome, setOutcome] = useState<Outcome>("delivered");
  const [customerPaid, setCustomerPaid] = useState(0);
  const [deliveryDate, setDeliveryDate] = useState("");
  const [settlementStatus, setSettlementStatus] = useState<SettlementStatus>("pending");
  const [returnCost, setReturnCost] = useState(0);
  const [otherCost, setOtherCost] = useState(0);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open || !order) return;
    const today = new Date().toISOString().slice(0, 10);
    setCompany(order.courier.company || "");
    setTrackingId(order.courier.trackingId || "");
    setDispatchDate(today);
    // The customer's delivery charge is counted as the courier charge by default —
    // staff can still edit it here if the courier actually billed a different amount.
    setForwardCost(order.courier.forwardCost || order.deliveryCharge || 0);
    setOutcome("delivered");
    setCustomerPaid(expectedCod(order));
    setDeliveryDate(today);
    setSettlementStatus("settled");
    setReturnCost(0);
    setOtherCost(0);
    setReason("");
  }, [open, order]);

  if (!open || !order) return null;

  function selectOutcome(next: Outcome) {
    setOutcome(next);
    if (!order) return;
    if (next === "delivered") {
      setCustomerPaid(expectedCod(order));
    } else if (next === "partial") {
      // Default to the forward courier cost already on file — the operator
      // adjusts it to whatever the customer actually paid before confirming.
      setCustomerPaid(order.courier.forwardCost);
    }
    // "refuse" doesn't use customerPaid — it's forced to 0 on confirm.
  }

  function handleMarkProcessing() {
    if (!order) return;
    markProcessing(order.id);
    showToast(`Order #${order.orderNumber} moved to Processing`);
    onClose();
  }

  function handleDispatch() {
    if (!order) return;
    dispatchOrder(order.id, { company: company.trim(), trackingId: trackingId.trim(), dispatchDate, forwardCost });
    showToast(`Order #${order.orderNumber} marked In Transit`);
    onClose();
  }

  function handleConfirmOutcome() {
    if (!order) return;
    if (outcome === "delivered") {
      markDelivered(order.id, { customerPaid, deliveryDate, settlementStatus });
      showToast(`Order #${order.orderNumber} marked Delivered`);
    } else if (outcome === "partial") {
      markPartialDelivered(order.id, { customerPaid, returnCost, otherCost, reason });
      showToast(`Order #${order.orderNumber} marked Partial Delivered`);
    } else {
      markRefuseReturn(order.id, { returnCost, otherCost });
      showToast(`Order #${order.orderNumber} marked Refuse Return`);
    }
    onClose();
  }

  const previewCourierCost = actualCourierCost({ ...order, courier: { ...order.courier, forwardCost: order.courier.forwardCost || forwardCost, returnCost, otherCost } });
  const previewNet = customerPaid - previewCourierCost;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div className="card flex max-h-[85vh] w-full max-w-lg flex-col overflow-y-auto p-5">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <p className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>
              Update Status
            </p>
            <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
              Order #{order.orderNumber}
            </p>
          </div>
          <button onClick={onClose} className="focus-ring rounded-md p-1" style={{ color: "var(--text-faint)" }}>
            <X size={18} />
          </button>
        </div>

        {order.status === "pending" && (
          <div className="space-y-4">
            <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
              Move this order into preparation. It stays cancellable while Processing.
            </p>
            <button
              onClick={handleMarkProcessing}
              className="focus-ring flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-semibold text-white"
              style={{ background: "var(--brand)" }}
            >
              Mark as Processing
            </button>
          </div>
        )}

        {order.status === "processing" && (
          <div className="space-y-4">
            <p className="flex items-center gap-1.5 text-[13px] font-medium" style={{ color: "var(--text)" }}>
              <Truck size={15} style={{ color: "var(--brand)" }} />
              Hand off to courier
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Courier Company (optional)">
                <input
                  value={company}
                  list="courier-companies"
                  onChange={(e) => {
                    const v = e.target.value;
                    setCompany(v);
                    // Pre-fill the courier's default forward cost from Settings → Courier when nothing was typed yet.
                    const hit = couriers.find((c) => c.name.toLowerCase() === v.toLowerCase());
                    if (hit && forwardCost === 0) setForwardCost(hit.defaultForwardCost);
                  }}
                  placeholder="Choose or type a courier"
                  className={inputClass}
                  style={inputStyle}
                />
                <datalist id="courier-companies">
                  {couriers.map((c) => (
                    <option key={c.id} value={c.name} />
                  ))}
                </datalist>
              </Field>
              <Field label="Tracking ID (optional)">
                <input value={trackingId} onChange={(e) => setTrackingId(e.target.value)} placeholder="e.g. STF-88213" className={inputClass} style={inputStyle} />
              </Field>
              <Field label="Dispatch Date">
                <input type="date" value={dispatchDate} onChange={(e) => setDispatchDate(e.target.value)} className={inputClass} style={inputStyle} />
              </Field>
              <Field label="Forward Courier Cost (৳)">
                <input type="number" min={0} value={forwardCost} onChange={(e) => setForwardCost(Number(e.target.value))} className={inputClass} style={inputStyle} />
              </Field>
            </div>
            <button
              onClick={handleDispatch}
              className="focus-ring flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-semibold text-white"
              style={{ background: "var(--brand)" }}
            >
              Mark as In Transit
            </button>
            <p className="text-[11.5px]" style={{ color: "var(--text-faint)" }}>
              Cancelling won&apos;t be possible once this order is In Transit.
            </p>
          </div>
        )}

        {order.status === "in_transit" && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <OutcomeTab active={outcome === "delivered"} onClick={() => selectOutcome("delivered")} icon={PackageCheck} label="Delivered" color="var(--green)" />
              <OutcomeTab active={outcome === "partial"} onClick={() => selectOutcome("partial")} icon={RotateCcw} label="Partial" color="#b45309" />
              <OutcomeTab active={outcome === "refuse"} onClick={() => selectOutcome("refuse")} icon={PackageX} label="Refuse" color="var(--red)" />
            </div>

            {outcome === "delivered" && (
              <div className="space-y-3">
                <Field label="Customer Paid / Collected Amount (৳)">
                  <input type="number" min={0} value={customerPaid} onChange={(e) => setCustomerPaid(Number(e.target.value))} className={inputClass} style={inputStyle} />
                </Field>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Delivery Date">
                    <input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} className={inputClass} style={inputStyle} />
                  </Field>
                  <Field label="Settlement Status">
                    <select value={settlementStatus} onChange={(e) => setSettlementStatus(e.target.value as SettlementStatus)} className={inputClass} style={inputStyle}>
                      <option value="settled">Settled</option>
                      <option value="pending">Pending</option>
                    </select>
                  </Field>
                </div>
              </div>
            )}

            {outcome === "partial" && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Customer Paid Amount (৳)">
                    <input type="number" min={0} value={customerPaid} onChange={(e) => setCustomerPaid(Number(e.target.value))} className={inputClass} style={inputStyle} />
                    <span className="mt-1 block text-[11px]" style={{ color: "var(--text-faint)" }}>
                      Defaults to the forward courier cost (৳{order.courier.forwardCost}) — edit to what the customer actually paid.
                    </span>
                  </Field>
                  <Field label="Return Courier Cost (৳)">
                    <input type="number" min={0} value={returnCost} onChange={(e) => setReturnCost(Number(e.target.value))} className={inputClass} style={inputStyle} />
                  </Field>
                  <Field label="Other Courier Cost (৳)">
                    <input type="number" min={0} value={otherCost} onChange={(e) => setOtherCost(Number(e.target.value))} className={inputClass} style={inputStyle} />
                  </Field>
                  <Field label="Reason">
                    <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. one item damaged" className={inputClass} style={inputStyle} />
                  </Field>
                </div>
                <div className="rounded-xl border p-3 text-[12.5px]" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                  <div className="flex justify-between">
                    <span style={{ color: "var(--text-muted)" }}>Actual Courier Cost</span>
                    <span style={{ color: "var(--text)" }}>{formatTaka(previewCourierCost, 2)}</span>
                  </div>
                  <div className="mt-1 flex justify-between font-medium">
                    <span style={{ color: "var(--text-muted)" }}>Courier Net</span>
                    <span style={{ color: previewNet >= 0 ? "var(--green)" : "var(--red)" }}>
                      {previewNet >= 0 ? "Profit " : "Loss "}
                      {formatTaka(Math.abs(previewNet), 2)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {outcome === "refuse" && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Return Courier Cost (৳)">
                    <input type="number" min={0} value={returnCost} onChange={(e) => setReturnCost(Number(e.target.value))} className={inputClass} style={inputStyle} />
                  </Field>
                  <Field label="Other Courier Cost (৳)">
                    <input type="number" min={0} value={otherCost} onChange={(e) => setOtherCost(Number(e.target.value))} className={inputClass} style={inputStyle} />
                  </Field>
                </div>
                <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                  Customer Paid is forced to ৳0 for Refuse Return.
                </p>
                <div className="rounded-xl border p-3 text-[12.5px]" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                  <div className="flex justify-between font-medium">
                    <span style={{ color: "var(--text-muted)" }}>Courier Loss</span>
                    <span style={{ color: "var(--red)" }}>{formatTaka(order.courier.forwardCost + returnCost + otherCost, 2)}</span>
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={handleConfirmOutcome}
              className="focus-ring flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-semibold text-white"
              style={{ background: "var(--brand)" }}
            >
              Confirm {outcome === "delivered" ? "Delivered" : outcome === "partial" ? "Partial Delivered" : "Refuse Return"}
            </button>
          </div>
        )}

        {(order.status === "delivered" || order.status === "partial_delivered" || order.status === "refuse_return" || order.status === "cancelled") && (
          <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
            This order has reached a final status ({order.status.replace("_", " ")}) and can&apos;t be moved further.
          </p>
        )}
      </div>
    </div>
  );
}

function OutcomeTab({
  active,
  onClick,
  icon: Icon,
  label,
  color,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  color: string;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx("focus-ring flex flex-col items-center gap-1.5 rounded-xl border py-2.5 text-[12px] font-medium transition-colors")}
      style={{
        borderColor: active ? color : "var(--border)",
        background: active ? "var(--surface-2)" : "var(--surface)",
        color: active ? color : "var(--text-muted)",
      }}
    >
      <Icon size={16} />
      {label}
    </button>
  );
}
