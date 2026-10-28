"use client";

import { Suspense, useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Plus, Printer, Eye, Pencil, Trash2, RefreshCcw, Ban, ChevronLeft, ChevronRight, X, Truck } from "lucide-react";
import { useOrders } from "@/lib/orders/store";
import { useToast } from "@/components/toast";
import { useSettings } from "@/lib/settings/store";
import { api } from "@/lib/persist/api";
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
  const { orders, deleteOrder, dispatchOrder, markProcessing } = useOrders();
  const { settings } = useSettings();
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

  // Bulk dispatch to Steadfast (Settings → Courier & Settlement → Steadfast API).
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [dispatchProgress, setDispatchProgress] = useState<{ done: number; total: number } | null>(null);

  const steadfastEnabled = settings.courier.steadfast?.enabled ?? false;
  const activeCouriers = settings.courier.couriers.filter((c) => c.status === "active");
  // Same matching rule as the dispatch modal: the built-in Steadfast courier, even if its name was edited.
  const isSteadfastName = (name: string) => {
    const n = name.trim().toLowerCase();
    return !!n && activeCouriers.some((c) => (c.id === "cr-steadfast" || c.name.trim().toLowerCase() === "steadfast") && c.name.trim().toLowerCase() === n);
  };

  /** Pending or Processing orders can be handed to a courier. */
  const isDispatchable = (o: Order) => o.status === "pending" || o.status === "processing";
  const selectedOrders = useMemo(() => orders.filter((o) => selected.has(o.id) && isDispatchable(o)), [orders, selected]);

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

  const pageDispatchableIds = pageItems.filter(isDispatchable).map((o) => o.id);
  const allPageChecked = pageDispatchableIds.length > 0 && pageDispatchableIds.every((id) => selected.has(id));

  function toggleSelected(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Header checkbox: selects/deselects every Processing order on the current page. */
  function togglePageSelection() {
    setSelected((s) => {
      const next = new Set(s);
      const allOn = pageDispatchableIds.length > 0 && pageDispatchableIds.every((id) => next.has(id));
      for (const id of pageDispatchableIds) {
        if (allOn) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  /**
   * Sends every selected order to Steadfast (create_order), stores the consignment id as its Tracking ID
   * and marks it Processing (if Pending) or In Transit (if already Processing). One parcel at a time, so a single failure never blocks the rest.
   */
  async function handleBulkDispatch() {
    const targets = selectedOrders;
    if (!targets.length || dispatching) return;
    setDispatching(true);
    let sent = 0;
    const problems: string[] = [];
    const unresolved: string[] = [];
    for (let i = 0; i < targets.length; i++) {
      const o = targets[i];
      setDispatchProgress({ done: i, total: targets.length });
      const companyName = (o.courier.company || "").trim();
      if (companyName && !isSteadfastName(companyName)) {
        problems.push(`#${o.orderNumber} is assigned to ${companyName}`);
        unresolved.push(o.id);
        continue;
      }
      try {
        let tracking = o.courier?.trackingId;
        // If it doesn't have a tracking ID yet, create consignment with Steadfast
        if (!tracking) {
          const res = await api<{ consignmentId: number; trackingCode: string }>("POST", "/api/courier/steadfast", {
            invoice: o.orderNumber,
            recipientName: o.customerName,
            phone: o.phone,
            address: [o.address, o.area, o.district].filter(Boolean).join(", "),
            codAmount: expectedCod(o),
            description: o.items.map((it) => `${it.qty}x ${it.productName} (${[it.color, it.size].filter(Boolean).join("/")})`).join(", "),
          });
          tracking = String(res.consignmentId);
        }

        if (o.status === "pending") {
          markProcessing(o.id, {
            company: companyName || "Steadfast",
            trackingId: tracking,
          });
        } else {
          dispatchOrder(o.id, {
            company: companyName || "Steadfast",
            trackingId: tracking,
            dispatchDate: new Date().toISOString().slice(0, 10),
            forwardCost: o.courier.forwardCost || o.deliveryCharge || 0,
          });
        }
        sent++;
      } catch (err) {
        problems.push(`#${o.orderNumber}: ${err instanceof Error ? err.message : "couldn't create the consignment"}`);
        unresolved.push(o.id);
      }
    }
    setDispatchProgress(null);
    setDispatching(false);
    setConfirmBulk(false);
    // Drop the successful ones from the selection; anything unresolved stays ticked for one-click retry.
    setSelected(new Set(unresolved));
    if (sent) showToast(`${sent} parcel${sent === 1 ? "" : "s"} sent to Steadfast and moved forward`, "success");
    if (problems.length) showToast(problems.length === 1 ? problems[0] : `${problems.length} orders weren't sent — ${problems[0]}`, "error");
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

      {/* Bulk dispatch bar (Steadfast) */}
      {selected.size > 0 && (
        <div className="card flex flex-wrap items-center justify-between gap-3 p-3.5">
          <p className="text-[13px]" style={{ color: "var(--text)" }}>
            <b>{selectedOrders.length}</b> order{selectedOrders.length === 1 ? "" : "s"} selected
            <span className="ml-2 text-[12px]" style={{ color: "var(--text-faint)" }}>
              COD total {formatTaka(selectedOrders.reduce((s, o) => s + expectedCod(o), 0), 2)}
            </span>
          </p>
          <div className="flex items-center gap-2">
            <button onClick={() => setSelected(new Set())} className="focus-ring rounded-xl border px-3 py-2 text-[12.5px] font-medium" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
              Clear
            </button>
            <button
              onClick={() => setConfirmBulk(true)}
              disabled={dispatching || !steadfastEnabled || selectedOrders.length === 0}
              className="focus-ring flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
              style={{ background: "var(--brand)" }}
            >
              <Truck size={15} />
              {dispatching && dispatchProgress ? `Sending ${dispatchProgress.done + 1}/${dispatchProgress.total}…` : `Dispatch to Steadfast (${selectedOrders.length})`}
            </button>
          </div>
          {!steadfastEnabled && (
            <p className="w-full text-[12px]" style={{ color: "var(--text-faint)" }}>
              Bulk dispatch is off — enable the Steadfast integration under Settings → Courier & Settlement → Steadfast API.
            </p>
          )}
        </div>
      )}

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1020px] border-collapse text-left">
            <thead>
              <tr className="text-[11.5px]" style={{ color: "var(--text-faint)", background: "var(--surface-2)" }}>
                <th className="w-10 px-3 py-3 font-medium">
                  <input
                    type="checkbox"
                    checked={allPageChecked}
                    onChange={togglePageSelection}
                    disabled={pageDispatchableIds.length === 0}
                    aria-label="Select all processing orders on this page"
                    className="accent-[var(--brand)]"
                  />
                </th>
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
                    <input
                      type="checkbox"
                      checked={selected.has(o.id)}
                      onChange={() => toggleSelected(o.id)}
                      disabled={!isDispatchable(o)}
                      aria-label={`Select order #${o.orderNumber}`}
                      className="accent-[var(--brand)] disabled:opacity-30"
                    />
                  </td>
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
        open={confirmBulk}
        title="Send to Steadfast"
        message={`Create a Steadfast consignment for each of the ${selectedOrders.length} selected order(s) (COD total ${formatTaka(selectedOrders.reduce((s, o) => s + expectedCod(o), 0), 2)}) and move pending orders to Processing? Each parcel is sent one at a time; anything that fails stays selected so you can retry.`}
        confirmLabel="Send to Steadfast"
        onCancel={() => setConfirmBulk(false)}
        onConfirm={handleBulkDispatch}
      />
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
