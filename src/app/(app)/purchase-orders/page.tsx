"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Plus, Eye, Pencil, Ban, Trash2, X } from "lucide-react";
import { usePurchaseOrders } from "@/lib/purchase-orders/store";
import { useSuppliers } from "@/lib/suppliers/store";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { RowActionsMenu, type RowAction } from "@/components/products/row-actions-menu";
import { PoStatusBadge } from "@/components/purchase-orders/status-badge";
import { formatTaka } from "@/lib/products/utils";
import { canCancelPo, canDeletePo, canEditPo, PO_STATUS_LABELS, poGrandTotal, totalOrderedQty, totalReceivedQty } from "@/lib/purchase-orders/utils";
import type { POStatus, PurchaseOrder } from "@/lib/purchase-orders/types";

const ALL_STATUSES: POStatus[] = ["draft", "approved", "sent", "partially_received", "received", "cancelled"];

export default function PurchaseOrdersListPage() {
  const { purchaseOrders, cancelPo, deletePo } = usePurchaseOrders();
  const { suppliers } = useSuppliers();
  const showToast = useToast();
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | POStatus>("all");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [cancelTarget, setCancelTarget] = useState<PurchaseOrder | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PurchaseOrder | null>(null);

  function supplierName(id: string) {
    return suppliers.find((s) => s.id === id)?.name ?? "Unknown Supplier";
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return purchaseOrders.filter((po) => {
      if (q) {
        const hit = po.poNumber.toLowerCase().includes(q) || supplierName(po.supplierId).toLowerCase().includes(q);
        if (!hit) return false;
      }
      if (status !== "all" && po.status !== status) return false;
      if (supplierFilter !== "all" && po.supplierId !== supplierFilter) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchaseOrders, search, status, supplierFilter, suppliers]);

  function rowActionsFor(po: PurchaseOrder): RowAction[] {
    const actions: RowAction[] = [{ label: "View", icon: Eye, onClick: () => router.push(`/purchase-orders/${po.id}`) }];
    if (canEditPo(po)) actions.push({ label: "Edit", icon: Pencil, onClick: () => router.push(`/purchase-orders/${po.id}/edit`) });
    if (canCancelPo(po)) actions.push({ label: "Cancel", icon: Ban, danger: true, onClick: () => setCancelTarget(po) });
    if (canDeletePo(po)) actions.push({ label: "Delete", icon: Trash2, danger: true, onClick: () => setDeleteTarget(po) });
    return actions;
  }

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold" style={{ color: "var(--text)" }}>
            Purchase Orders
          </h1>
          <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
            {purchaseOrders.length} purchase order{purchaseOrders.length === 1 ? "" : "s"}
          </p>
        </div>
        <Link href="/purchase-orders/new" className="focus-ring flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-semibold text-white" style={{ background: "var(--brand)" }}>
          <Plus size={15} />
          Create PO
        </Link>
      </div>

      <div className="card flex flex-wrap items-end gap-3 p-4">
        <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border px-3 py-2" style={{ borderColor: "var(--border)" }}>
          <Search size={15} style={{ color: "var(--text-faint)" }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="PO number or supplier..." className="w-full bg-transparent text-[13px] outline-none" style={{ color: "var(--text)" }} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium" style={{ color: "var(--text-faint)" }}>Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="focus-ring rounded-xl border px-3 py-2 text-[13px]" style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}>
            <option value="all">All</option>
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>{PO_STATUS_LABELS[s]}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium" style={{ color: "var(--text-faint)" }}>Supplier</span>
          <select value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)} className="focus-ring rounded-xl border px-3 py-2 text-[13px]" style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}>
            <option value="all">All</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
        {(search || status !== "all" || supplierFilter !== "all") && (
          <button onClick={() => { setSearch(""); setStatus("all"); setSupplierFilter("all"); }} className="focus-ring flex items-center gap-1 rounded-xl px-3 py-2 text-[13px] font-medium" style={{ color: "var(--brand)" }}>
            <X size={14} />
            Clear
          </button>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-left">
            <thead>
              <tr className="text-[11.5px]" style={{ color: "var(--text-faint)", background: "var(--surface-2)" }}>
                <th className="px-3 py-3 font-medium">PO No</th>
                <th className="px-3 py-3 font-medium">Supplier</th>
                <th className="px-3 py-3 font-medium">Created</th>
                <th className="px-3 py-3 font-medium">Expected</th>
                <th className="px-3 py-3 font-medium">Items</th>
                <th className="px-3 py-3 font-medium">Grand Total</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium">Receiving</th>
                <th className="w-10 px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((po) => (
                <tr key={po.id} className="border-t" style={{ borderColor: "var(--border-soft)" }}>
                  <td className="px-3 py-3">
                    <Link href={`/purchase-orders/${po.id}`} className="text-[13px] font-medium hover:underline" style={{ color: "var(--text)" }}>
                      #{po.poNumber}
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-[12.5px]" style={{ color: "var(--text-muted)" }}>{supplierName(po.supplierId)}</td>
                  <td className="px-3 py-3 text-[12px]" style={{ color: "var(--text-faint)" }}>{new Date(po.createdAt).toLocaleDateString()}</td>
                  <td className="px-3 py-3 text-[12px]" style={{ color: "var(--text-faint)" }}>{po.expectedDate ? new Date(po.expectedDate).toLocaleDateString() : "—"}</td>
                  <td className="px-3 py-3 text-[12.5px]" style={{ color: "var(--text-muted)" }}>{totalOrderedQty(po)}</td>
                  <td className="px-3 py-3 text-[12.5px] font-medium" style={{ color: "var(--text)" }}>{formatTaka(poGrandTotal(po), 2)}</td>
                  <td className="px-3 py-3"><PoStatusBadge status={po.status} /></td>
                  <td className="px-3 py-3 text-[12.5px]" style={{ color: "var(--text-muted)" }}>{totalReceivedQty(po)}/{totalOrderedQty(po)}</td>
                  <td className="px-3 py-3 text-right"><RowActionsMenu actions={rowActionsFor(po)} /></td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-16 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>No purchase orders found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        open={!!cancelTarget}
        title="Cancel purchase order"
        message={`Cancel PO #${cancelTarget?.poNumber}? Any receiving already recorded stays on file.`}
        confirmLabel="Cancel PO"
        onCancel={() => setCancelTarget(null)}
        onConfirm={() => {
          if (cancelTarget) {
            cancelPo(cancelTarget.id);
            showToast(`PO #${cancelTarget.poNumber} cancelled`);
          }
          setCancelTarget(null);
        }}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete purchase order"
        message={`Delete PO #${deleteTarget?.poNumber}? This cannot be undone.`}
        confirmLabel="Delete"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            const result = deletePo(deleteTarget.id);
            showToast(result.ok ? `PO #${deleteTarget.poNumber} deleted` : result.error, result.ok ? "success" : "error");
          }
          setDeleteTarget(null);
        }}
      />
    </>
  );
}
