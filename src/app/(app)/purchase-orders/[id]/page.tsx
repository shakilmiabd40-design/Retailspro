"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Pencil, Ban, Trash2, PackageCheck, Printer, CheckCircle2, Send } from "lucide-react";
import { usePurchaseOrders } from "@/lib/purchase-orders/store";
import { useSuppliers } from "@/lib/suppliers/store";
import { useToast } from "@/components/toast";
import { useSettings } from "@/lib/settings/store";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PoStatusBadge } from "@/components/purchase-orders/status-badge";
import { formatTaka } from "@/lib/products/utils";
import { canCancelPo, canDeletePo, canEditPo, canReceivePo, poGrandTotal, poSubtotal } from "@/lib/purchase-orders/utils";

export default function PurchaseOrderDetailsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { getPo, hydrated, approvePo, sendPo, cancelPo, deletePo } = usePurchaseOrders();
  const { getSupplier } = useSuppliers();
  const showToast = useToast();
  const { settings } = useSettings();
  const po = getPo(params.id);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!hydrated) return <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading…</p>;

  if (!po) {
    return (
      <div className="card flex flex-col items-center gap-3 p-10 text-center">
        <p className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>Purchase order not found</p>
        <Link href="/purchase-orders" className="focus-ring mt-1 flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-medium text-white" style={{ background: "var(--brand)" }}>
          <ArrowLeft size={14} />
          Back to Purchase Orders
        </Link>
      </div>
    );
  }

  const supplier = getSupplier(po.supplierId);
  // Settings → Purchase: which status moves this shop allows.
  const moves = settings.purchase.transitions[po.status] ?? [];
  const canMoveTo = (to: (typeof moves)[number]) => moves.includes(to);

  function handlePrint() {
    if (!po) return;
    const win = window.open("", "_blank", "width=480,height=700");
    if (!win) {
      showToast("Pop-up blocked — allow pop-ups to print", "error");
      return;
    }
    const rows = po.items.map((i) => `<tr><td>${i.productName} (${i.color}/${i.size})</td><td>${i.qtyOrdered}</td><td>${formatTaka(i.unitCost, 2)}</td><td>${formatTaka(i.qtyOrdered * i.unitCost, 2)}</td></tr>`).join("");
    win.document.write(`
      <html><head><title>PO — ${po.poNumber}</title></head>
      <body style="font-family: ui-sans-serif, system-ui; padding:20px;">
        <h2>Purchase Order — #${po.poNumber}</h2>
        <p>Supplier: ${supplier?.name ?? "—"}</p>
        <table width="100%" cellpadding="6" style="border-collapse:collapse;margin-top:12px;">
          <thead><tr style="border-bottom:1px solid #ccc;text-align:left;"><th>Item</th><th>Qty</th><th>Cost</th><th>Total</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <p style="margin-top:16px;font-size:15px;"><b>Grand Total: ${formatTaka(poGrandTotal(po), 2)}</b></p>
        <script>window.onload = () => window.print();</script>
      </body></html>
    `);
    win.document.close();
  }

  return (
    <>
      <button onClick={() => router.back()} className="focus-ring flex items-center gap-1.5 text-[12.5px] font-medium" style={{ color: "var(--text-muted)" }}>
        <ArrowLeft size={14} />
        Back
      </button>

      <div className="card flex flex-wrap items-start justify-between gap-4 p-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[19px] font-semibold" style={{ color: "var(--text)" }}>#{po.poNumber}</h1>
            <PoStatusBadge status={po.status} />
          </div>
          <p className="mt-1 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
            {supplier?.name ?? "Unknown Supplier"} · Created {new Date(po.createdAt).toLocaleDateString()}
            {po.expectedDate && ` · Expected ${new Date(po.expectedDate).toLocaleDateString()}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {po.status === "draft" && canMoveTo("approved") && (
            <button onClick={() => { approvePo(po.id); showToast("PO approved"); }} className="focus-ring flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-semibold text-white" style={{ background: "var(--brand)" }}>
              <CheckCircle2 size={14} />
              Approve PO
            </button>
          )}
          {po.status === "approved" && canMoveTo("sent") && (
            <button onClick={() => { sendPo(po.id); showToast("Marked as sent to supplier"); }} className="focus-ring flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-semibold text-white" style={{ background: "var(--brand)" }}>
              <Send size={14} />
              Send PO
            </button>
          )}
          {canReceivePo(po) && (po.status === "partially_received" || canMoveTo("partially_received") || canMoveTo("received")) && (
            <Link href={`/purchase-orders/${po.id}/receive`} className="focus-ring flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-semibold text-white" style={{ background: "var(--brand)" }}>
              <PackageCheck size={14} />
              Receive Stock
            </Link>
          )}
          {canEditPo(po) && (
            <Link href={`/purchase-orders/${po.id}/edit`} className="focus-ring flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-[13px] font-medium" style={{ borderColor: "var(--border)", color: "var(--text)" }}>
              <Pencil size={14} />
              Edit
            </Link>
          )}
          <button onClick={handlePrint} className="focus-ring flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-[13px] font-medium" style={{ borderColor: "var(--border)", color: "var(--text)" }}>
            <Printer size={14} />
            Print
          </button>
          {canCancelPo(po) && canMoveTo("cancelled") && (
            <button onClick={() => setConfirmCancel(true)} className="focus-ring flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-[13px] font-medium" style={{ borderColor: "var(--border)", color: "var(--red)" }}>
              <Ban size={14} />
              Cancel
            </button>
          )}
          {canDeletePo(po) && (
            <button onClick={() => setConfirmDelete(true)} className="focus-ring flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-[13px] font-medium" style={{ borderColor: "var(--border)", color: "var(--red)" }}>
              <Trash2 size={14} />
              Delete
            </button>
          )}
        </div>
      </div>

      <div className="card p-5">
        <p className="mb-3 text-[14px] font-semibold" style={{ color: "var(--text)" }}>Items</p>
        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
          <table className="w-full min-w-[620px] border-collapse text-left text-[12.5px]">
            <thead>
              <tr style={{ background: "var(--surface-2)", color: "var(--text-faint)" }}>
                <th className="px-3 py-2 font-medium">Product</th>
                <th className="px-3 py-2 font-medium">Variant</th>
                <th className="px-3 py-2 font-medium">Qty Ordered</th>
                <th className="px-3 py-2 font-medium">Qty Received</th>
                <th className="px-3 py-2 font-medium">Unit Cost</th>
                <th className="px-3 py-2 font-medium">Line Total</th>
              </tr>
            </thead>
            <tbody>
              {po.items.map((i) => (
                <tr key={i.id} className="border-t" style={{ borderColor: "var(--border-soft)" }}>
                  <td className="px-3 py-2 font-medium" style={{ color: "var(--text)" }}>{i.productName}</td>
                  <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>{i.color} / {i.size}</td>
                  <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>{i.qtyOrdered}</td>
                  <td className="px-3 py-2" style={{ color: i.qtyReceived >= i.qtyOrdered ? "var(--green)" : "var(--brand)" }}>{i.qtyReceived}</td>
                  <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>{formatTaka(i.unitCost, 2)}</td>
                  <td className="px-3 py-2 font-medium" style={{ color: "var(--text)" }}>{formatTaka(i.qtyOrdered * i.unitCost, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="card p-5">
          <p className="mb-3 text-[14px] font-semibold" style={{ color: "var(--text)" }}>Cost Summary</p>
          <div className="space-y-2 text-[13px]">
            <div className="flex justify-between"><span style={{ color: "var(--text-muted)" }}>Subtotal</span><span style={{ color: "var(--text)" }}>{formatTaka(poSubtotal(po), 2)}</span></div>
            <div className="flex justify-between"><span style={{ color: "var(--text-muted)" }}>Shipping</span><span style={{ color: "var(--text)" }}>{formatTaka(po.shippingCost, 2)}</span></div>
            <div className="flex justify-between"><span style={{ color: "var(--text-muted)" }}>Discount</span><span style={{ color: "var(--text)" }}>- {formatTaka(po.discount, 2)}</span></div>
            <div className="flex justify-between border-t pt-2 text-[14px] font-semibold" style={{ borderColor: "var(--border)" }}><span style={{ color: "var(--text)" }}>Grand Total</span><span style={{ color: "var(--brand)" }}>{formatTaka(poGrandTotal(po), 2)}</span></div>
          </div>
        </div>

        <div className="card p-5">
          <p className="mb-3 text-[14px] font-semibold" style={{ color: "var(--text)" }}>Receiving History</p>
          {po.receivings.length === 0 ? (
            <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>No stock received yet.</p>
          ) : (
            <div className="space-y-3">
              {po.receivings.map((r) => (
                <div key={r.id} className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                  <p className="text-[12.5px] font-medium" style={{ color: "var(--text)" }}>{new Date(r.date).toLocaleString()}</p>
                  <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>{r.items.reduce((s, i) => s + i.qty, 0)} unit(s) received{r.note ? ` — ${r.note}` : ""}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmCancel}
        title="Cancel purchase order"
        message={`Cancel PO #${po.poNumber}? Any receiving already recorded stays on file.`}
        confirmLabel="Cancel PO"
        onCancel={() => setConfirmCancel(false)}
        onConfirm={() => { cancelPo(po.id); showToast("PO cancelled"); setConfirmCancel(false); }}
      />
      <ConfirmDialog
        open={confirmDelete}
        title="Delete purchase order"
        message={`Delete PO #${po.poNumber}? This cannot be undone.`}
        confirmLabel="Delete"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          const result = deletePo(po.id);
          showToast(result.ok ? "PO deleted" : result.error, result.ok ? "success" : "error");
          setConfirmDelete(false);
          if (result.ok) router.push("/purchase-orders");
        }}
      />
    </>
  );
}
