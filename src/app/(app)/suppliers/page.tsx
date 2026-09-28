"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Plus, Eye, Pencil, Archive, Trash2, X } from "lucide-react";
import { useSuppliers } from "@/lib/suppliers/store";
import { usePurchaseOrders } from "@/lib/purchase-orders/store";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { RowActionsMenu, type RowAction } from "@/components/products/row-actions-menu";
import { SupplierStatusBadge } from "@/components/suppliers/status-badge";
import type { Supplier, SupplierStatus } from "@/lib/suppliers/types";

export default function SuppliersListPage() {
  const { suppliers, archiveSupplier, deleteSupplier } = useSuppliers();
  const { purchaseOrders } = usePurchaseOrders();
  const showToast = useToast();
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | SupplierStatus>("all");
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null);

  const visible = suppliers.filter((s) => !s.archived);

  function poCountFor(supplierId: string) {
    return purchaseOrders.filter((po) => po.supplierId === supplierId).length;
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return visible.filter((s) => {
      if (q) {
        const hit = s.name.toLowerCase().includes(q) || s.phone.includes(q) || (s.email ?? "").toLowerCase().includes(q);
        if (!hit) return false;
      }
      if (status !== "all" && s.status !== status) return false;
      return true;
    });
  }, [visible, search, status]);

  function rowActionsFor(s: Supplier): RowAction[] {
    return [
      { label: "View", icon: Eye, onClick: () => router.push(`/suppliers/${s.id}`) },
      { label: "Edit", icon: Pencil, onClick: () => router.push(`/suppliers/${s.id}/edit`) },
      {
        label: poCountFor(s.id) > 0 ? "Archive" : "Delete",
        icon: poCountFor(s.id) > 0 ? Archive : Trash2,
        danger: true,
        onClick: () => setDeleteTarget(s),
      },
    ];
  }

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold" style={{ color: "var(--text)" }}>
            Suppliers
          </h1>
          <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
            {visible.length} supplier{visible.length === 1 ? "" : "s"}
          </p>
        </div>
        <Link
          href="/suppliers/new"
          className="focus-ring flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-semibold text-white"
          style={{ background: "var(--brand)" }}
        >
          <Plus size={15} />
          Add Supplier
        </Link>
      </div>

      <div className="card flex flex-wrap items-end gap-3 p-4">
        <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border px-3 py-2" style={{ borderColor: "var(--border)" }}>
          <Search size={15} style={{ color: "var(--text-faint)" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, phone or email..."
            className="w-full bg-transparent text-[13px] outline-none"
            style={{ color: "var(--text)" }}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium" style={{ color: "var(--text-faint)" }}>
            Status
          </span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            className="focus-ring rounded-xl border px-3 py-2 text-[13px]"
            style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
        {(search || status !== "all") && (
          <button onClick={() => { setSearch(""); setStatus("all"); }} className="focus-ring flex items-center gap-1 rounded-xl px-3 py-2 text-[13px] font-medium" style={{ color: "var(--brand)" }}>
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
                <th className="px-3 py-3 font-medium">Supplier</th>
                <th className="px-3 py-3 font-medium">Phone</th>
                <th className="px-3 py-3 font-medium">Email</th>
                <th className="px-3 py-3 font-medium">Address</th>
                <th className="px-3 py-3 font-medium">Total POs</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="w-10 px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} className="border-t" style={{ borderColor: "var(--border-soft)" }}>
                  <td className="px-3 py-3">
                    <Link href={`/suppliers/${s.id}`} className="text-[13px] font-medium hover:underline" style={{ color: "var(--text)" }}>
                      {s.name}
                    </Link>
                    {s.contactPerson && (
                      <p className="text-[11.5px]" style={{ color: "var(--text-faint)" }}>
                        {s.contactPerson}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-3 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                    {s.phone}
                  </td>
                  <td className="px-3 py-3 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                    {s.email || "—"}
                  </td>
                  <td className="px-3 py-3 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                    {s.city || "—"}
                  </td>
                  <td className="px-3 py-3 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                    {poCountFor(s.id)}
                  </td>
                  <td className="px-3 py-3">
                    <SupplierStatusBadge status={s.status} />
                  </td>
                  <td className="px-3 py-3 text-right">
                    <RowActionsMenu actions={rowActionsFor(s)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-16">
              <p className="text-[13.5px] font-medium" style={{ color: "var(--text)" }}>
                No suppliers found
              </p>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title={deleteTarget && poCountFor(deleteTarget.id) > 0 ? "Archive supplier" : "Delete supplier"}
        message={
          deleteTarget && poCountFor(deleteTarget.id) > 0
            ? `"${deleteTarget?.name}" has purchase order history, so it will be archived instead of deleted — it stays visible on past POs but won't appear in supplier lists.`
            : `Delete "${deleteTarget?.name}"? This cannot be undone.`
        }
        confirmLabel={deleteTarget && poCountFor(deleteTarget.id) > 0 ? "Archive" : "Delete"}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          if (poCountFor(deleteTarget.id) > 0) {
            archiveSupplier(deleteTarget.id);
            showToast(`Archived "${deleteTarget.name}"`);
          } else {
            deleteSupplier(deleteTarget.id);
            showToast(`Deleted "${deleteTarget.name}"`);
          }
          setDeleteTarget(null);
        }}
      />
    </>
  );
}
