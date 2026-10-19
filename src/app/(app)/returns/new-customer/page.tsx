"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";
import { useOrders } from "@/lib/orders/store";
import { useReturns } from "@/lib/returns/store";
import { useSettings } from "@/lib/settings/store";
import { useToast } from "@/components/toast";
import type { CustomerReturnAction, ItemCondition } from "@/lib/returns/types";
import type { Order } from "@/lib/orders/types";

const inputStyle = { borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" };
const inputClass = "focus-ring w-full rounded-xl border px-3 py-2 text-[13px]";

type DraftLine = {
  itemId: string;
  productId: string;
  productName: string;
  variantId: string;
  color: string;
  size: string;
  sku: string;
  qtyDelivered: number;
  qtyReturning: number;
  reason: string;
  condition: ItemCondition;
  selected: boolean;
};

export default function CreateCustomerReturnPage() {
  const { orders } = useOrders();
  const { createCustomerReturn } = useReturns();
  const showToast = useToast();
  const router = useRouter();

  const [orderQuery, setOrderQuery] = useState("");
  const [order, setOrder] = useState<Order | null>(null);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [action, setAction] = useState<CustomerReturnAction>("refund");
  const [refundAmount, setRefundAmount] = useState(0);
  const [refundMethod, setRefundMethod] = useState("Cash");
  const [notes, setNotes] = useState("");

  const { settings } = useSettings();
  const onlyDelivered = settings.returns.customerOnlyDelivered;
  const eligible = !order || !onlyDelivered || order.status === "delivered";

  const orderResults = useMemo(() => {
    const q = orderQuery.trim().toLowerCase();
    if (!q) return [];
    return orders.filter((o) => o.orderNumber.toLowerCase().includes(q) || o.customerName.toLowerCase().includes(q)).slice(0, 6);
  }, [orderQuery, orders]);

  function selectOrder(o: Order) {
    setOrder(o);
    setOrderQuery("");
    setLines(
      o.items.map((i) => ({
        itemId: i.id,
        productId: i.productId,
        productName: i.productName,
        variantId: i.variantId,
        color: i.color,
        size: i.size,
        sku: i.sku,
        qtyDelivered: i.qty,
        qtyReturning: i.qty,
        reason: "",
        condition: "new",
        selected: false,
      }))
    );
  }

  function updateLine(itemId: string, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l) => (l.itemId === itemId ? { ...l, ...patch } : l)));
  }

  function submit() {
    if (!order) {
      showToast("Search and select an order first", "error");
      return;
    }
    if (onlyDelivered && order.status !== "delivered") {
      showToast("Only Delivered orders can have a customer return", "error");
      return;
    }
    const selected = lines.filter((l) => l.selected && l.qtyReturning > 0);
    if (!selected.length) {
      showToast("Select at least one item to return", "error");
      return;
    }
    const result = createCustomerReturn({
      orderId: order.id,
      action,
      refundAmount: action === "refund" ? refundAmount : undefined,
      refundMethod: action === "refund" ? refundMethod : undefined,
      notes,
      items: selected.map((l) => ({
        productId: l.productId,
        productName: l.productName,
        variantId: l.variantId,
        color: l.color,
        size: l.size,
        sku: l.sku,
        qty: l.qtyReturning,
        reason: l.reason || "Not specified",
        condition: l.condition,
      })),
    });
    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    showToast(`Return #${result.record.returnNumber} created`);
    router.push(`/returns/${result.record.id}`);
  }

  return (
    <div className="space-y-5 pb-10">
      <Link href="/returns" className="focus-ring flex items-center gap-1.5 text-[12.5px] font-medium" style={{ color: "var(--text-muted)" }}>
        <ArrowLeft size={14} />
        Back to Returns
      </Link>

      <div className="flex items-center justify-between">
        <h1 className="text-[20px] font-semibold" style={{ color: "var(--text)" }}>
          Create Customer Return
        </h1>
        <button onClick={submit} className="focus-ring rounded-xl px-4 py-2 text-[13px] font-semibold text-white" style={{ background: "var(--brand)" }}>
          Save Return
        </button>
      </div>

      <datalist id="customer-return-reasons">
        {settings.returns.customerReasons.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>

      <section className="card space-y-4 p-5">
        <p className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>Reference</p>
        <div className="relative">
          <label className="flex items-center gap-2 rounded-xl border px-3 py-2" style={{ borderColor: "var(--border)" }}>
            <Search size={15} style={{ color: "var(--text-faint)" }} />
            <input value={orderQuery} onChange={(e) => setOrderQuery(e.target.value)} placeholder="Search order by number or customer..." className="w-full bg-transparent text-[13px] outline-none" style={{ color: "var(--text)" }} />
          </label>
          {orderResults.length > 0 && (
            <div className="absolute z-10 mt-1 w-full divide-y overflow-hidden rounded-xl border shadow-lg" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              {orderResults.map((o) => (
                <button key={o.id} type="button" onClick={() => selectOrder(o)} className="flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-[var(--surface-2)]">
                  <span>
                    <span className="block text-[13px] font-medium" style={{ color: "var(--text)" }}>#{o.orderNumber} — {o.customerName}</span>
                    <span className="block text-[11.5px]" style={{ color: "var(--text-faint)" }}>{o.status}</span>
                  </span>
                  <span className="text-[12px] font-medium" style={{ color: "var(--brand)" }}>Select</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {order && (
          <div className="rounded-xl border p-3 text-[12.5px]" style={{ borderColor: eligible ? "var(--border)" : "var(--red)", background: "var(--surface-2)" }}>
            <p style={{ color: "var(--text)" }}>
              #{order.orderNumber} — {order.customerName} ({order.phone})
            </p>
            {!eligible && (
              <p className="mt-1" style={{ color: "var(--red)" }}>
                This order is <b>{order.status.replace("_", " ")}</b>, not Delivered — a customer return isn&apos;t applicable (nothing was actually sold).
              </p>
            )}
          </div>
        )}
      </section>

      {order && eligible && (
        <>
          <section className="card space-y-4 p-5">
            <p className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>Return Items</p>
            <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
              <table className="w-full min-w-[720px] border-collapse text-left text-[12.5px]">
                <thead>
                  <tr style={{ background: "var(--surface-2)", color: "var(--text-faint)" }}>
                    <th className="px-3 py-2" />
                    <th className="px-3 py-2 font-medium">Product</th>
                    <th className="px-3 py-2 font-medium">Qty Delivered</th>
                    <th className="px-3 py-2 font-medium">Qty Returning</th>
                    <th className="px-3 py-2 font-medium">Reason</th>
                    <th className="px-3 py-2 font-medium">Condition</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.itemId} className="border-t" style={{ borderColor: "var(--border-soft)" }}>
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={l.selected} onChange={(e) => updateLine(l.itemId, { selected: e.target.checked })} className="h-4 w-4" />
                      </td>
                      <td className="px-3 py-2 font-medium" style={{ color: "var(--text)" }}>
                        {l.productName} <span className="font-normal" style={{ color: "var(--text-muted)" }}>({l.color}/{l.size})</span>
                      </td>
                      <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>{l.qtyDelivered}</td>
                      <td className="px-3 py-2">
                        <input type="number" min={1} max={l.qtyDelivered} value={l.qtyReturning} onChange={(e) => updateLine(l.itemId, { qtyReturning: Math.max(1, Math.min(l.qtyDelivered, Number(e.target.value))) })} className="w-16 rounded-lg border px-2 py-1" style={inputStyle} />
                      </td>
                      <td className="px-3 py-2">
                        <input value={l.reason} onChange={(e) => updateLine(l.itemId, { reason: e.target.value })} list="customer-return-reasons" placeholder="e.g. size issue" className="w-36 rounded-lg border px-2 py-1" style={inputStyle} />
                      </td>
                      <td className="px-3 py-2">
                        <select value={l.condition} onChange={(e) => updateLine(l.itemId, { condition: e.target.value as ItemCondition })} className="rounded-lg border px-2 py-1" style={inputStyle}>
                          <option value="new">New</option>
                          <option value="used">Used</option>
                          <option value="damaged">Damaged</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card space-y-4 p-5">
            <p className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>Return Type</p>
            <div className="grid grid-cols-3 gap-2">
              {(["refund", "exchange", "warranty_claim"] as CustomerReturnAction[]).map((a) => (
                <button key={a} onClick={() => setAction(a)} className="focus-ring rounded-xl border py-2.5 text-[12.5px] font-medium capitalize" style={{ borderColor: action === a ? "var(--brand)" : "var(--border)", background: action === a ? "var(--brand-soft)" : "var(--surface)", color: action === a ? "var(--brand)" : "var(--text-muted)" }}>
                  {a.replace("_", " ")}
                </button>
              ))}
            </div>
            {action === "refund" && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-[12.5px] font-medium" style={{ color: "var(--text-muted)" }}>Refund Amount (৳)</span>
                  <input type="number" min={0} value={refundAmount} onChange={(e) => setRefundAmount(Number(e.target.value))} className={inputClass} style={inputStyle} />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[12.5px] font-medium" style={{ color: "var(--text-muted)" }}>Refund Method</span>
                  <input value={refundMethod} onChange={(e) => setRefundMethod(e.target.value)} placeholder="Cash / bKash / Adjustment" className={inputClass} style={inputStyle} />
                </label>
              </div>
            )}
            <label className="block">
              <span className="mb-1.5 block text-[12.5px] font-medium" style={{ color: "var(--text-muted)" }}>Notes</span>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputClass} style={inputStyle} />
            </label>
          </section>
        </>
      )}
    </div>
  );
}
