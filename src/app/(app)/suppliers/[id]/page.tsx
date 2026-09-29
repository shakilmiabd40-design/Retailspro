"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Pencil, Archive } from "lucide-react";
import { useSuppliers } from "@/lib/suppliers/store";
import { usePurchaseOrders } from "@/lib/purchase-orders/store";
import { useReturns } from "@/lib/returns/store";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SupplierStatusBadge } from "@/components/suppliers/status-badge";
import { PoStatusBadge } from "@/components/purchase-orders/status-badge";
import { ReturnStatusBadge } from "@/components/returns/status-badge";
import { formatTaka } from "@/lib/products/utils";
import { poGrandTotal } from "@/lib/purchase-orders/utils";

const TABS = ["Overview", "Purchase Orders", "Returns to Supplier"] as const;

export default function SupplierDetailsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { getSupplier, hydrated, archiveSupplier } = useSuppliers();
  const { purchaseOrders } = usePurchaseOrders();
  const { returns } = useReturns();
  const showToast = useToast();
  const supplier = getSupplier(params.id);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
  const [confirmArchive, setConfirmArchive] = useState(false);

  if (!hydrated) return <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading…</p>;

  if (!supplier) {
    return (
      <div className="card flex flex-col items-center gap-3 p-10 text-center">
        <p className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>
          Supplier not found
        </p>
        <Link href="/suppliers" className="focus-ring mt-1 flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-medium text-white" style={{ background: "var(--brand)" }}>
          <ArrowLeft size={14} />
          Back to Suppliers
        </Link>
      </div>
    );
  }

  const supplierPos = purchaseOrders.filter((po) => po.supplierId === supplier.id);
  const supplierReturns = returns.filter((r) => r.type === "supplier" && r.partyName === supplier.name);
  const lastPo = [...supplierPos].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

  return (
    <>
      <button onClick={() => router.back()} className="focus-ring flex items-center gap-1.5 text-[12.5px] font-medium" style={{ color: "var(--text-muted)" }}>
        <ArrowLeft size={14} />
        Back
      </button>

      <div className="card flex flex-wrap items-start justify-between gap-4 p-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[19px] font-semibold" style={{ color: "var(--text)" }}>
              {supplier.name}
            </h1>
            <SupplierStatusBadge status={supplier.status} />
          </div>
          <p className="mt-1 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
            {supplier.phone} {supplier.email ? `· ${supplier.email}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/suppliers/${supplier.id}/edit`} className="focus-ring flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-[13px] font-medium" style={{ borderColor: "var(--border)", color: "var(--text)" }}>
            <Pencil size={14} />
            Edit
          </Link>
          <button onClick={() => setConfirmArchive(true)} className="focus-ring flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-[13px] font-medium" style={{ borderColor: "var(--border)", color: "var(--red)" }}>
            <Archive size={14} />
            Archive
          </button>
        </div>
      </div>

      <div className="flex gap-1 rounded-xl border p-1" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="focus-ring flex-1 rounded-lg py-2 text-[12.5px] font-medium transition-colors"
            style={{ background: tab === t ? "var(--brand)" : "transparent", color: tab === t ? "#fff" : "var(--text-muted)" }}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Overview" && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div className="card p-5">
            <p className="mb-3 text-[14px] font-semibold" style={{ color: "var(--text)" }}>
              Contact
            </p>
            <div className="space-y-2 text-[13px]">
              <Row label="Contact Person" value={supplier.contactPerson || "—"} />
              <Row label="Phone" value={supplier.phone} />
              <Row label="Email" value={supplier.email || "—"} />
              <Row label="City" value={supplier.city || "—"} />
              <Row label="Address" value={supplier.address || "—"} />
            </div>
          </div>
          <div className="card p-5">
            <p className="mb-3 text-[14px] font-semibold" style={{ color: "var(--text)" }}>
              Quick Stats
            </p>
            <div className="space-y-2 text-[13px]">
              <Row label="Total Purchase Orders" value={String(supplierPos.length)} />
              <Row label="Last Purchase" value={lastPo ? new Date(lastPo.createdAt).toLocaleDateString() : "—"} />
              <Row label="Payment Terms" value={supplier.paymentTerms || "—"} />
              <Row label="Currency" value={supplier.currency || "—"} />
              <Row label="Opening Balance" value={formatTaka(supplier.openingBalance ?? 0, 2)} />
            </div>
          </div>
          {supplier.notes && (
            <div className="card p-5 sm:col-span-2">
              <p className="mb-2 text-[14px] font-semibold" style={{ color: "var(--text)" }}>
                Notes
              </p>
              <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
                {supplier.notes}
              </p>
            </div>
          )}
        </div>
      )}

      {tab === "Purchase Orders" && (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[480px] border-collapse text-left text-[12.5px]">
            <thead>
              <tr style={{ background: "var(--surface-2)", color: "var(--text-faint)" }}>
                <th className="px-3 py-2 font-medium">PO No</th>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Total</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {supplierPos.map((po) => (
                <tr key={po.id} className="border-t" style={{ borderColor: "var(--border-soft)" }}>
                  <td className="px-3 py-2">
                    <Link href={`/purchase-orders/${po.id}`} className="font-medium hover:underline" style={{ color: "var(--text)" }}>
                      #{po.poNumber}
                    </Link>
                  </td>
                  <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>
                    {new Date(po.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2" style={{ color: "var(--text)" }}>
                    {formatTaka(poGrandTotal(po), 2)}
                  </td>
                  <td className="px-3 py-2">
                    <PoStatusBadge status={po.status} />
                  </td>
                </tr>
              ))}
              {supplierPos.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center" style={{ color: "var(--text-muted)" }}>
                    No purchase orders yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "Returns to Supplier" && (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-left text-[12.5px]">
            <thead>
              <tr style={{ background: "var(--surface-2)", color: "var(--text-faint)" }}>
                <th className="px-3 py-2 font-medium">Return No</th>
                <th className="px-3 py-2 font-medium">Items</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {supplierReturns.map((r) => (
                <tr key={r.id} className="border-t" style={{ borderColor: "var(--border-soft)" }}>
                  <td className="px-3 py-2">
                    <Link href={`/returns/${r.id}`} className="font-medium hover:underline" style={{ color: "var(--text)" }}>
                      #{r.returnNumber}
                    </Link>
                  </td>
                  <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>
                    {r.items.reduce((s, i) => s + i.qty, 0)}
                  </td>
                  <td className="px-3 py-2">
                    <ReturnStatusBadge status={r.status} />
                  </td>
                </tr>
              ))}
              {supplierReturns.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-8 text-center" style={{ color: "var(--text-muted)" }}>
                    No returns to this supplier yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={confirmArchive}
        title="Archive supplier"
        message={`Archive "${supplier.name}"? It will stay attached to past purchase orders but won't appear in supplier lists.`}
        confirmLabel="Archive"
        onCancel={() => setConfirmArchive(false)}
        onConfirm={() => {
          archiveSupplier(supplier.id);
          showToast("Supplier archived");
          router.push("/suppliers");
        }}
      />
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span style={{ color: "var(--text)" }}>{value}</span>
    </div>
  );
}
