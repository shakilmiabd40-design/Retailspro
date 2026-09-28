"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Eye, Trash2, X } from "lucide-react";
import { useReturns } from "@/lib/returns/store";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { RowActionsMenu, type RowAction } from "@/components/products/row-actions-menu";
import { ReturnStatusBadge } from "@/components/returns/status-badge";
import { canDeleteReturn, RETURN_STATUS_LABELS, RETURN_TYPE_LABELS } from "@/lib/returns/utils";
import type { ReturnRecord, ReturnStatus, ReturnType } from "@/lib/returns/types";

const ALL_STATUSES: ReturnStatus[] = ["requested", "approved", "rejected", "received", "closed"];

export default function ReturnsListPage() {
  const { returns, deleteReturn } = useReturns();
  const showToast = useToast();
  const router = useRouter();

  const [type, setType] = useState<"all" | ReturnType>("all");
  const [status, setStatus] = useState<"all" | ReturnStatus>("all");
  const [deleteTarget, setDeleteTarget] = useState<ReturnRecord | null>(null);

  const filtered = useMemo(() => {
    return returns.filter((r) => {
      if (type !== "all" && r.type !== type) return false;
      if (status !== "all" && r.status !== status) return false;
      return true;
    });
  }, [returns, type, status]);

  function rowActionsFor(r: ReturnRecord): RowAction[] {
    const actions: RowAction[] = [{ label: "View", icon: Eye, onClick: () => router.push(`/returns/${r.id}`) }];
    if (canDeleteReturn(r.status)) actions.push({ label: "Delete", icon: Trash2, danger: true, onClick: () => setDeleteTarget(r) });
    return actions;
  }

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold" style={{ color: "var(--text)" }}>
            Returns
          </h1>
          <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
            {returns.length} return{returns.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/returns/new-customer" className="focus-ring flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-[13px] font-medium" style={{ borderColor: "var(--border)", color: "var(--text)" }}>
            <Plus size={15} />
            Create Customer Return
          </Link>
          <Link href="/returns/new-supplier" className="focus-ring flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-semibold text-white" style={{ background: "var(--brand)" }}>
            <Plus size={15} />
            Create Supplier Return
          </Link>
        </div>
      </div>

      <div className="card flex flex-wrap items-end gap-3 p-4">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium" style={{ color: "var(--text-faint)" }}>Return Type</span>
          <select value={type} onChange={(e) => setType(e.target.value as typeof type)} className="focus-ring rounded-xl border px-3 py-2 text-[13px]" style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}>
            <option value="all">All</option>
            <option value="customer">Customer Return</option>
            <option value="supplier">Supplier Return</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium" style={{ color: "var(--text-faint)" }}>Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="focus-ring rounded-xl border px-3 py-2 text-[13px]" style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}>
            <option value="all">All</option>
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>{RETURN_STATUS_LABELS[s]}</option>
            ))}
          </select>
        </label>
        {(type !== "all" || status !== "all") && (
          <button onClick={() => { setType("all"); setStatus("all"); }} className="focus-ring flex items-center gap-1 rounded-xl px-3 py-2 text-[13px] font-medium" style={{ color: "var(--brand)" }}>
            <X size={14} />
            Clear
          </button>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead>
              <tr className="text-[11.5px]" style={{ color: "var(--text-faint)", background: "var(--surface-2)" }}>
                <th className="px-3 py-3 font-medium">Return ID</th>
                <th className="px-3 py-3 font-medium">Type</th>
                <th className="px-3 py-3 font-medium">Reference</th>
                <th className="px-3 py-3 font-medium">Customer/Supplier</th>
                <th className="px-3 py-3 font-medium">Total Qty</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium">Created</th>
                <th className="w-10 px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t" style={{ borderColor: "var(--border-soft)" }}>
                  <td className="px-3 py-3">
                    <Link href={`/returns/${r.id}`} className="text-[13px] font-medium hover:underline" style={{ color: "var(--text)" }}>#{r.returnNumber}</Link>
                  </td>
                  <td className="px-3 py-3 text-[12.5px]" style={{ color: "var(--text-muted)" }}>{RETURN_TYPE_LABELS[r.type]}</td>
                  <td className="px-3 py-3 text-[12.5px]" style={{ color: "var(--text-muted)" }}>#{r.referenceLabel}</td>
                  <td className="px-3 py-3 text-[12.5px]" style={{ color: "var(--text-muted)" }}>{r.partyName}</td>
                  <td className="px-3 py-3 text-[12.5px]" style={{ color: "var(--text-muted)" }}>{r.items.reduce((s, i) => s + i.qty, 0)}</td>
                  <td className="px-3 py-3"><ReturnStatusBadge status={r.status} /></td>
                  <td className="px-3 py-3 text-[12px]" style={{ color: "var(--text-faint)" }}>{new Date(r.createdAt).toLocaleDateString()}</td>
                  <td className="px-3 py-3 text-right"><RowActionsMenu actions={rowActionsFor(r)} /></td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-16 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>No returns found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete return"
        message={`Delete return #${deleteTarget?.returnNumber}? This cannot be undone.`}
        confirmLabel="Delete"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            const result = deleteReturn(deleteTarget.id);
            showToast(result.ok ? "Return deleted" : result.error, result.ok ? "success" : "error");
          }
          setDeleteTarget(null);
        }}
      />
    </>
  );
}
