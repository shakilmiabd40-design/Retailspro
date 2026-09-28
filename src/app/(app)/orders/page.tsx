"use client";

import { Suspense, useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Plus, Printer, Eye, Pencil, Trash2, RefreshCcw, Ban, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useOrders } from "@/lib/orders/store";
import { useToast } from "@/components/toast";
import { OrderStatusBadge } from "@/components/orders/status-badge";
import { RowActionsMenu, type RowAction } from "@/components/products/row-actions-menu";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CancelOrderModal } from "@/components/orders/cancel-order-modal";
import { UpdateStatusModal } from "@/components/orders/update-status-modal";
import { formatTaka } from "@/lib/products/utils";
import {
  canCancelOrder,
  collectedAmount,
  courierCostForSummary,
  courierLoss,
  courierProfit,
  expectedCod,
  isFinalStatus,
  ORDER_STATUS_LABELS,
  totalItemQty,
} from "@/lib/orders/utils";
import type { Order, OrderStatus } from "@/lib/orders/types";

const PAGE_SIZES = [20, 50, 100] as const;
const ALL_STATUSES: OrderStatus[] = ["pending", "processing", "in_transit", "delivered", "partial_delivered", "refuse_return", "cancelled"];

function OrdersPageInner() {
  const { orders, deleteOrder } = useOrders();
  const showToast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialStatus = (searchParams.get("status") as OrderStatus | null) ?? "all";

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<OrderStatus | "all">(initialStatus);
  const [courier, setCourier] = useState("all");

  // Sync status state when URL search parameters change
  useEffect(() => {
    const currentStatus = (searchParams.get("status") as OrderStatus | null) ?? "all";
    if (currentStatus !== status) {
      setStatus(currentStatus);
      setPage(1);
    }
  }, [searchParams, status]);

  const [settlement, setSettlement] = useState<"all" | "settled" | "pending">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(20);
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
  const [statusTarget, setStatusTarget] = useState<Order | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Order | null>(null);

  const courierCompanies = useMemo(
    () => Array.from(new Set(orders.map((o) => o.courier.company).filter(Boolean))).sort(),
    [orders]
  );

  const dateFiltered = useMemo(() => {
    if (!dateFrom && !dateTo) return orders;
    const from = dateFrom ? new Date(dateFrom).getTime() : -Infinity;
    const to = dateTo ? new Date(dateTo).getTime() + 24 * 60 * 60 * 1000 - 1 : Infinity;
    return orders.filter((o) => {
      const t = new Date(o.createdAt).getTime();
      return t >= from && t <= to;
    });
  }, [orders, dateFrom, dateTo]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return dateFiltered.filter((o) => {
      if (q) {
        const hit =
          o.orderNumber.toLowerCase().includes(q) ||
          o.customerName.toLowerCase().includes(q) ||
          o.phone.toLowerCase().includes(q) ||
          o.courier.trackingId.toLowerCase().includes(q);
        if (!hit) return false;
      }
      if (status !== "all" && o.status !== status) return false;
      if (courier !== "all" && o.courier.company !== courier) return false;
      if (settlement !== "all" && o.delivery.settlementStatus !== settlement) return false;
      return true;
    });
  }, [dateFiltered, search, status, courier, settlement]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const operational = useMemo(() => {
    const counts: Record<string, number> = { total: dateFiltered.length };
    for (const s of ALL_STATUSES) counts[s] = 0;
    for (const o of dateFiltered) counts[o.status] += 1;
    return counts;
  }, [dateFiltered]);

  const financial = useMemo(() => {
    const active = dateFiltered.filter((o) => o.status !== "cancelled");
    return {
      totalCod: active.reduce((s, o) => s + expectedCod(o), 0),
      collected: dateFiltered.reduce((s, o) => s + collectedAmount(o), 0),
      courierCost: dateFiltered.reduce((s, o) => s + courierCostForSummary(o), 0),
      courierProfit: dateFiltered.reduce((s, o) => s + courierProfit(o), 0),
      courierLoss: dateFiltered.reduce((s, o) => s + courierLoss(o), 0),
    };
  }, [dateFiltered]);

  function clearFilters() {
    setSearch("");
    setStatus("all");
    setCourier("all");
    setSettlement("all");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  }

  const filtersActive = search || status !== "all" || courier !== "all" || settlement !== "all" || dateFrom || dateTo;

  function handlePrintInvoice(order: Order) {
    router.push(`/orders/${order.id}/invoice`);
  }

  function rowActionsFor(order: Order): RowAction[] {
    const actions: RowAction[] = [
      { label: "View", icon: Eye, onClick: () => router.push(`/orders/${order.id}`) },
    ];
    if (!isFinalStatus(order.status)) {
      actions.push({ label: "Update Status", icon: RefreshCcw, onClick: () => setStatusTarget(order) });
    }
    if (canCancelOrder(order.status)) {
      actions.push({ label: "Cancel Order", icon: Ban, danger: true, onClick: () => setCancelTarget(order) });
    }
    actions.push({ label: "Edit Order", icon: Pencil, onClick: () => router.push(`/orders/${order.id}/edit`) });
    actions.push({ label: "Print Invoice", icon: Printer, onClick: () => handlePrintInvoice(order) });
    actions.push({ label: "Delete Order", icon: Trash2, danger: true, onClick: () => setDeleteTarget(order) });
    return actions;
  }

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold" style={{ color: "var(--text)" }}>
            Orders
          </h1>
          <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
            {dateFiltered.length} order{dateFiltered.length === 1 ? "" : "s"}
            {dateFrom || dateTo ? " in range" : " total"}
          </p>
        </div>
        <Link
          href="/orders/new"
          className="focus-ring flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-semibold text-white"
          style={{ background: "var(--brand)" }}
        >
          <Plus size={15} />
          Create Order
        </Link>
      </div>

      {/* Operational summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
        <SummaryTile label="Total Orders" value={String(operational.total)} />
        <SummaryTile label="Pending" value={String(operational.pending)} />
        <SummaryTile label="Processing" value={String(operational.processing)} accent="var(--brand)" />
        <SummaryTile label="In Transit" value={String(operational.in_transit)} accent="var(--blue)" />
        <SummaryTile label="Delivered" value={String(operational.delivered)} accent="var(--green)" />
        <SummaryTile label="Partial" value={String(operational.partial_delivered)} accent="#b45309" />
        <SummaryTile label="Refuse" value={String(operational.refuse_return)} accent="var(--red)" />
        <SummaryTile label="Cancelled" value={String(operational.cancelled)} accent="var(--text-faint)" />
      </div>

      {/* Financial summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <SummaryTile label="Total COD" value={formatTaka(financial.totalCod, 2)} />
        <SummaryTile label="Collected Amount" value={formatTaka(financial.collected, 2)} accent="var(--green)" />
        <SummaryTile label="Courier Cost" value={formatTaka(financial.courierCost, 2)} />
        <SummaryTile label="Courier Profit" value={formatTaka(financial.courierProfit, 2)} accent="var(--green)" />
        <SummaryTile label="Courier Loss" value={formatTaka(financial.courierLoss, 2)} accent="var(--red)" />
      </div>

      {/* Filters */}
      <div className="card flex flex-wrap items-end gap-3 p-4">
        <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border px-3 py-2" style={{ borderColor: "var(--border)" }}>
          <Search size={15} style={{ color: "var(--text-faint)" }} />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Order ID, customer, phone, tracking..."
            className="w-full bg-transparent text-[13px] outline-none"
            style={{ color: "var(--text)" }}
          />
        </label>

        <FilterField label="Status">
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as OrderStatus | "all");
              setPage(1);
            }}
            className="focus-ring rounded-xl border px-3 py-2 text-[13px]"
            style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
          >
            <option value="all">All</option>
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {ORDER_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </FilterField>

        <FilterField label="Courier Company">
          <select
            value={courier}
            onChange={(e) => {
              setCourier(e.target.value);
              setPage(1);
            }}
            className="focus-ring rounded-xl border px-3 py-2 text-[13px]"
            style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
          >
            <option value="all">All</option>
            {courierCompanies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </FilterField>

        <FilterField label="Settlement">
          <select
            value={settlement}
            onChange={(e) => {
              setSettlement(e.target.value as typeof settlement);
              setPage(1);
            }}
            className="focus-ring rounded-xl border px-3 py-2 text-[13px]"
            style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
          >
            <option value="all">All</option>
            <option value="settled">Settled</option>
            <option value="pending">Pending</option>
          </select>
        </FilterField>

        <FilterField label="From">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="focus-ring rounded-xl border px-3 py-2 text-[13px]"
            style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
          />
        </FilterField>
        <FilterField label="To">
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="focus-ring rounded-xl border px-3 py-2 text-[13px]"
            style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
          />
        </FilterField>

        {filtersActive && (
          <button onClick={clearFilters} className="focus-ring flex items-center gap-1 rounded-xl px-3 py-2 text-[13px] font-medium" style={{ color: "var(--brand)" }}>
            <X size={14} />
            Clear Filters
          </button>
        )}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-left">
            <thead>
              <tr className="text-[11.5px]" style={{ color: "var(--text-faint)", background: "var(--surface-2)" }}>
                <th className="px-3 py-3 font-medium">Order</th>
                <th className="px-3 py-3 font-medium">Customer</th>
                <th className="px-3 py-3 font-medium">Items</th>
                <th className="px-3 py-3 font-medium">Order Amount</th>
                <th className="px-3 py-3 font-medium">COD</th>
                <th className="px-3 py-3 font-medium">Courier</th>
                <th className="px-3 py-3 font-medium">Courier Cost</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium">Date</th>
                <th className="w-10 px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {pageItems.map((o) => (
                <tr key={o.id} className="border-t" style={{ borderColor: "var(--border-soft)" }}>
                  <td className="px-3 py-3">
                    <Link href={`/orders/${o.id}`} className="text-[13px] font-medium hover:underline" style={{ color: "var(--text)" }}>
                      #{o.orderNumber}
                    </Link>
                  </td>
                  <td className="px-3 py-3">
                    <p className="text-[13px]" style={{ color: "var(--text)" }}>
                      {o.customerName}
                    </p>
                    <p className="text-[11.5px]" style={{ color: "var(--text-faint)" }}>
                      {o.phone}
                    </p>
                  </td>
                  <td className="px-3 py-3 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                    {totalItemQty(o)}
                  </td>
                  <td className="px-3 py-3 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                    {formatTaka(expectedCod(o) - o.deliveryCharge, 2)}
                  </td>
                  <td className="px-3 py-3 text-[12.5px] font-medium" style={{ color: "var(--text)" }}>
                    {formatTaka(expectedCod(o), 2)}
                  </td>
                  <td className="px-3 py-3">
                    <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                      {o.courier.company || "—"}
                    </p>
                    {o.courier.trackingId && (
                      <p className="text-[11px]" style={{ color: "var(--text-faint)" }}>
                        {o.courier.trackingId}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-3 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                    {formatTaka(courierCostForSummary(o), 2)}
                  </td>
                  <td className="px-3 py-3">
                    <OrderStatusBadge status={o.status} />
                  </td>
                  <td className="px-3 py-3 text-[12px]" style={{ color: "var(--text-faint)" }}>
                    {new Date(o.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <RowActionsMenu actions={rowActionsFor(o)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {pageItems.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-16">
              <p className="text-[13.5px] font-medium" style={{ color: "var(--text)" }}>
                No orders found
              </p>
              <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                Try adjusting your filters, or create a new order.
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-2 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
            Show
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value) as (typeof PAGE_SIZES)[number]);
                setPage(1);
              }}
              className="focus-ring rounded-lg border px-2 py-1"
              style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            per page · {filtered.length} results
          </div>
          <div className="flex items-center gap-2">
            <button
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="focus-ring flex h-8 w-8 items-center justify-center rounded-lg border disabled:opacity-40"
              style={{ borderColor: "var(--border)", color: "var(--text)" }}
            >
              <ChevronLeft size={15} />
            </button>
            <span className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
              Page {currentPage} of {totalPages}
            </span>
            <button
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="focus-ring flex h-8 w-8 items-center justify-center rounded-lg border disabled:opacity-40"
              style={{ borderColor: "var(--border)", color: "var(--text)" }}
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </div>

      <CancelOrderModal order={cancelTarget} open={!!cancelTarget} onClose={() => setCancelTarget(null)} />
      <UpdateStatusModal order={statusTarget} open={!!statusTarget} onClose={() => setStatusTarget(null)} />
      <ConfirmDialog
        open={!!deleteTarget}
        title={deleteTarget ? `Delete order #${deleteTarget.orderNumber}` : "Delete order"}
        message="This permanently removes the order. Reserved stock is released, sold stock is put back, and any warranties for it are voided. This can't be undone."
        confirmLabel="Delete Order"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          const result = deleteOrder(deleteTarget.id);
          if (!result.ok) showToast(result.error, "error");
          else showToast(`Order #${deleteTarget.orderNumber} deleted`);
          setDeleteTarget(null);
        }}
      />
    </>
  );
}

function SummaryTile({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="card p-3.5">
      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
        {label}
      </p>
      <p className="mt-1 text-[16px] font-semibold" style={{ color: accent ?? "var(--text)" }}>
        {value}
      </p>
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium" style={{ color: "var(--text-faint)" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading…</p>}>
      <OrdersPageInner />
    </Suspense>
  );
}
