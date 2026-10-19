"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check, X, PackageCheck, Lock, Trash2 } from "lucide-react";
import { useReturns } from "@/lib/returns/store";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ReturnStatusBadge } from "@/components/returns/status-badge";
import { canDeleteReturn, RETURN_TYPE_LABELS } from "@/lib/returns/utils";
import { formatTaka } from "@/lib/products/utils";

export default function ReturnDetailsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { getReturn, hydrated, approveReturn, rejectReturn, markReturnReceived, closeReturn, deleteReturn } = useReturns();
  const showToast = useToast();
  const record = getReturn(params.id);
  const [confirmReceive, setConfirmReceive] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!hydrated) return <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading…</p>;

  if (!record) {
    return (
      <div className="card flex flex-col items-center gap-3 p-10 text-center">
        <p className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>Return not found</p>
        <Link href="/returns" className="focus-ring mt-1 flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-medium text-white" style={{ background: "var(--brand)" }}>
          <ArrowLeft size={14} />
          Back to Returns
        </Link>
      </div>
    );
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
            <h1 className="text-[19px] font-semibold" style={{ color: "var(--text)" }}>#{record.returnNumber}</h1>
            <ReturnStatusBadge status={record.status} />
          </div>
          <p className="mt-1 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
            {RETURN_TYPE_LABELS[record.type]} · Reference #{record.referenceLabel} · {record.partyName}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {record.status === "requested" && (
            <>
              <button onClick={() => { approveReturn(record.id); showToast("Return approved"); }} className="focus-ring flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-semibold text-white" style={{ background: "var(--brand)" }}>
                <Check size={14} />
                Approve
              </button>
              <button onClick={() => { rejectReturn(record.id); showToast("Return rejected"); }} className="focus-ring flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-[13px] font-medium" style={{ borderColor: "var(--border)", color: "var(--red)" }}>
                <X size={14} />
                Reject
              </button>
            </>
          )}
          {record.status === "approved" && !record.returnReceived && (
            <button onClick={() => setConfirmReceive(true)} className="focus-ring flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-semibold text-white" style={{ background: "var(--brand)" }}>
              <PackageCheck size={14} />
              Mark Received
            </button>
          )}
          {record.status === "received" && (
            <button onClick={() => { closeReturn(record.id); showToast("Return closed"); }} className="focus-ring flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-[13px] font-medium" style={{ borderColor: "var(--border)", color: "var(--text)" }}>
              <Lock size={14} />
              Close
            </button>
          )}
          {canDeleteReturn(record.status) && (
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
          <table className="w-full min-w-[560px] border-collapse text-left text-[12.5px]">
            <thead>
              <tr style={{ background: "var(--surface-2)", color: "var(--text-faint)" }}>
                <th className="px-3 py-2 font-medium">Product</th>
                <th className="px-3 py-2 font-medium">Qty</th>
                <th className="px-3 py-2 font-medium">Reason</th>
                <th className="px-3 py-2 font-medium">Condition</th>
              </tr>
            </thead>
            <tbody>
              {record.items.map((i) => (
                <tr key={i.id} className="border-t" style={{ borderColor: "var(--border-soft)" }}>
                  <td className="px-3 py-2 font-medium" style={{ color: "var(--text)" }}>{i.productName} <span className="font-normal" style={{ color: "var(--text-muted)" }}>({i.color}/{i.size})</span></td>
                  <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>{i.qty}</td>
                  <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>{i.reason}</td>
                  <td className="px-3 py-2 capitalize" style={{ color: i.condition === "damaged" ? "var(--red)" : "var(--text-muted)" }}>{i.condition}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {record.type === "customer" && (
          <div className="card p-5">
            <p className="mb-3 text-[14px] font-semibold" style={{ color: "var(--text)" }}>Financial</p>
            <div className="space-y-2 text-[13px]">
              <div className="flex justify-between"><span style={{ color: "var(--text-muted)" }}>Action</span><span className="capitalize" style={{ color: "var(--text)" }}>{record.action?.replace("_", " ") ?? "—"}</span></div>
              {record.action === "refund" && (
                <>
                  <div className="flex justify-between"><span style={{ color: "var(--text-muted)" }}>Refund Amount</span><span style={{ color: "var(--text)" }}>{formatTaka(record.refundAmount ?? 0, 2)}</span></div>
                  <div className="flex justify-between"><span style={{ color: "var(--text-muted)" }}>Refund Method</span><span style={{ color: "var(--text)" }}>{record.refundMethod ?? "—"}</span></div>
                </>
              )}
            </div>
          </div>
        )}
        {record.type === "supplier" && (
          <div className="card p-5">
            <p className="mb-3 text-[14px] font-semibold" style={{ color: "var(--text)" }}>Shipment / Cost</p>
            <div className="space-y-2 text-[13px]">
              <div className="flex justify-between"><span style={{ color: "var(--text-muted)" }}>Transport Cost</span><span style={{ color: "var(--text)" }}>{formatTaka(record.transportCost ?? 0, 2)}</span></div>
            </div>
          </div>
        )}
        <div className="card p-5">
          <p className="mb-3 text-[14px] font-semibold" style={{ color: "var(--text)" }}>Status</p>
          <div className="space-y-2 text-[13px]">
            <div className="flex justify-between"><span style={{ color: "var(--text-muted)" }}>Return Received</span><span style={{ color: record.returnReceived ? "var(--green)" : "var(--brand)" }}>{record.returnReceived ? "Yes" : "No"}</span></div>
            {record.returnReceivedAt && <div className="flex justify-between"><span style={{ color: "var(--text-muted)" }}>Received Date</span><span style={{ color: "var(--text)" }}>{new Date(record.returnReceivedAt).toLocaleDateString()}</span></div>}
            {record.notes && <div><span style={{ color: "var(--text-muted)" }}>Notes</span><p className="mt-1" style={{ color: "var(--text)" }}>{record.notes}</p></div>}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmReceive}
        title="Mark return received"
        message={
          record.type === "customer"
            ? "Non-damaged items go back into available stock; damaged items are excluded from sellable stock."
            : "This decreases inventory — the item is leaving the business back to the supplier."
        }
        confirmLabel="Confirm"
        danger={false}
        onCancel={() => setConfirmReceive(false)}
        onConfirm={() => {
          markReturnReceived(record.id);
          showToast("Return received — stock updated");
          setConfirmReceive(false);
        }}
      />
      <ConfirmDialog
        open={confirmDelete}
        title="Delete return"
        message={`Delete return #${record.returnNumber}? This cannot be undone.`}
        confirmLabel="Delete"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          const result = deleteReturn(record.id);
          showToast(result.ok ? "Return deleted" : result.error, result.ok ? "success" : "error");
          setConfirmDelete(false);
          if (result.ok) router.push("/returns");
        }}
      />
    </>
  );
}
