"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { useWarranty } from "@/lib/warranty/store";
import { WarrantyStatusBadge } from "@/components/warranty/status-badge";
import { daysLeft, effectiveStatus, WARRANTY_STATUS_LABELS } from "@/lib/warranty/utils";
import type { WarrantyStatus } from "@/lib/warranty/types";

const ALL_STATUSES: WarrantyStatus[] = ["active", "expired", "claimed", "closed", "void"];

export default function WarrantyListPage() {
  const { warranties } = useWarranty();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | WarrantyStatus>("all");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return warranties.filter((w) => {
      if (q) {
        const hit =
          w.warrantyNumber.toLowerCase().includes(q) ||
          w.orderNumber.toLowerCase().includes(q) ||
          w.customerPhone.toLowerCase().includes(q) ||
          w.sku.toLowerCase().includes(q);
        if (!hit) return false;
      }
      if (statusFilter !== "all" && effectiveStatus(w) !== statusFilter) return false;
      return true;
    });
  }, [warranties, search, statusFilter]);

  return (
    <>
      <div>
        <h1 className="text-[20px] font-semibold" style={{ color: "var(--text)" }}>
          Warranty
        </h1>
        <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
          {warranties.length} warranty record{warranties.length === 1 ? "" : "s"} — auto-created whenever an order is marked Delivered.
        </p>
      </div>

      <div className="card flex flex-wrap items-end gap-3 p-4">
        <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border px-3 py-2" style={{ borderColor: "var(--border)" }}>
          <Search size={15} style={{ color: "var(--text-faint)" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Warranty ID, order ID, phone, SKU..."
            className="w-full bg-transparent text-[13px] outline-none"
            style={{ color: "var(--text)" }}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium" style={{ color: "var(--text-faint)" }}>Status</span>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className="focus-ring rounded-xl border px-3 py-2 text-[13px]" style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}>
            <option value="all">All</option>
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>{WARRANTY_STATUS_LABELS[s]}</option>
            ))}
          </select>
        </label>
        {(search || statusFilter !== "all") && (
          <button onClick={() => { setSearch(""); setStatusFilter("all"); }} className="focus-ring flex items-center gap-1 rounded-xl px-3 py-2 text-[13px] font-medium" style={{ color: "var(--brand)" }}>
            <X size={14} />
            Clear
          </button>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-left">
            <thead>
              <tr className="text-[11.5px]" style={{ color: "var(--text-faint)", background: "var(--surface-2)" }}>
                <th className="px-3 py-3 font-medium">Warranty ID</th>
                <th className="px-3 py-3 font-medium">Order ID</th>
                <th className="px-3 py-3 font-medium">Customer</th>
                <th className="px-3 py-3 font-medium">Product / SKU</th>
                <th className="px-3 py-3 font-medium">Start</th>
                <th className="px-3 py-3 font-medium">End</th>
                <th className="px-3 py-3 font-medium">Days Left</th>
                <th className="px-3 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((w) => {
                const status = effectiveStatus(w);
                const left = daysLeft(w);
                return (
                  <tr key={w.id} className="border-t" style={{ borderColor: "var(--border-soft)" }}>
                    <td className="px-3 py-3">
                      <Link href={`/warranty/${w.id}`} className="text-[13px] font-medium hover:underline" style={{ color: "var(--text)" }}>#{w.warrantyNumber}</Link>
                    </td>
                    <td className="px-3 py-3 text-[12.5px]" style={{ color: "var(--text-muted)" }}>#{w.orderNumber}</td>
                    <td className="px-3 py-3 text-[12.5px]" style={{ color: "var(--text-muted)" }}>{w.customerName}</td>
                    <td className="px-3 py-3 text-[12.5px]" style={{ color: "var(--text-muted)" }}>{w.productName} <span style={{ color: "var(--text-faint)" }}>({w.color}/{w.size})</span></td>
                    <td className="px-3 py-3 text-[12px]" style={{ color: "var(--text-faint)" }}>{new Date(w.startDate).toLocaleDateString()}</td>
                    <td className="px-3 py-3 text-[12px]" style={{ color: "var(--text-faint)" }}>{new Date(w.endDate).toLocaleDateString()}</td>
                    <td className="px-3 py-3 text-[12.5px]" style={{ color: status === "active" ? "var(--text)" : "var(--text-faint)" }}>{status === "active" ? `${left}d` : "—"}</td>
                    <td className="px-3 py-3"><WarrantyStatusBadge status={status} /></td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-16 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>No warranty records yet — they&apos;re created automatically when orders are delivered.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
