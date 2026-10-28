"use client";

import { Suspense, useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Plus, Printer, Eye, Pencil, Trash2, RefreshCcw, Ban, ChevronLeft, ChevronRight, X, Truck, CheckCircle2 } from "lucide-react";
import { useOrders } from "@/lib/orders/store";
import { useSettlements } from "@/lib/settlements/store";
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
  const { getRow, recordPayout } = useSettlements();
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

  // Bulk dispatch & bulk settlement
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [confirmBulkSettle, setConfirmBulkSettle] = useState(false);
  const [settling, setSettling] = useState(false);
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

  /** Delivered or Partial Delivered orders with pending settlement can be settled. Fully settled cannot be re-settled. */
  const isSettlable = (o: Order) => {
    if (o.status !== "delivered" && o.status !== "partial_delivered") return false;
    const r = getRow(o.id);
    if (!r) return o.delivery.settlementStatus !== "settled";
    return r.status !== "Settled" && r.pending > 0;
  };

  const isSelectable = (o: Order) => isDispatchable(o) || isSettlable(o);
  const selectedSettlableOrders = useMemo(() => orders.filter((o) => selected.has(o.id) && isSettlable(o)), [orders, selected]);

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

  const pageSelectableIds = pageItems.filter(isSelectable).map((o) => o.id);
  const allPageChecked = pageSelectableIds.length > 0 && pageSelectableIds.every((id) => selected.has(id));

  function toggleSelected(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Header checkbox: selects/deselects every selectable order on the current page. */
  function togglePageSelection() {
    setSelected((s) => {
      const next = new Set(s);
      const allOn = pageSelectableIds.length > 0 && pageSelectableIds.every((id) => next.has(id));
      for (const id of pageSelectableIds) {
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

  /**
   * Bulk settles all selected delivered/partial orders that still have pending settlement balance.
   */
  async function handleBulkSettlement() {
    const targets = selectedSettlableOrders;
    if (!targets.length || settling) return;
    setSettling(true);

    try {
      // Group by courier company
      const byCourier = new Map<string, { total: number; allocations: { orderId: string; amount: number }[] }>();

      for (const o of targets) {
        const courierName = o.courier.company || "Steadfast";
        const row = getRow(o.id);
        const pendingAmount = row ? row.pending : Math.max(0, (o.delivery.customerPaid || expectedCod(o)) - (o.courier.forwardCost || 0));
        if (pendingAmount <= 0) continue;

        const cur = byCourier.get(courierName) ?? { total: 0, allocations: [] };
        cur.total += pendingAmount;
        cur.allocations.push({ orderId: o.id, amount: pendingAmount });
        byCourier.set(courierName, cur);
      }

      let settledCount = 0;
      const today = new Date().toISOString().slice(0, 10);

      for (const [courierName, group] of byCourier) {
        if (group.total <= 0) continue;
        const result = recordPayout({
          courier: courierName,
          amount: group.total,
          paidDate: today,
          reference: "Bulk settlement",
          allocations: group.allocations,
        });

        if (result.ok) {
          settledCount += group.allocations.length;
        } else {
          showToast(`Settlement error for ${courierName}: ${result.error}`, "error");
        }
      }

      setSelected(new Set());
      setConfirmBulkSettle(false);
      if (settledCount > 0) {
        showToast(`${settledCount} order(s) successfully marked as Settled`, "success");
      }
    } catch (e) {
      showToast((e as Error)?.message || "Failed to record bulk settlement", "error");
    } finally {
      setSettling(false);
    }
  }

  function rowActionsFor(order: Order): RowAction[] {
    const actions: RowAction[] = [
      { label: "View", icon: Eye, onClick: () => router.push(`/orders/${order.id}`) },
    ];
    if (!isFinalStatus(order.status)) {
      actions.push({ label: "Update Status", icon: RefreshCcw, onClick: () => setStatusTarget(order) });
    }
    if (isSettlable(order)) {
      actions.push({
        label: "Mark as Settled",
        icon: CheckCircle2,
        onClick: () => {
          setSelected(new Set([order.id]));
          setConfirmBulkSettle(true);
        },
      });
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
        <SummaryTile label="Total Orders" value={String(operational.total)} active={status === "all"} onClick={() => { setStatus("all"); setPage(1); }} />
        <SummaryTile label="Pending" value={String(operational.pending)} active={status === "pending"} onClick={() => { setStatus("pending"); setPage(1); }} />
        <SummaryTile label="Processing" value={String(operational.processing)} accent="var(--brand)" active={status === "processing"} onClick={() => { setStatus("processing"); setPage(1); }} />
        <SummaryTile label="In Transit" value={String(operational.in_transit)} accent="var(--blue)" active={status === "in_transit"} onClick={() => { setStatus("in_transit"); setPage(1); }} />
        <SummaryTile label="Delivered" value={String(operational.delivered)} accent="var(--green)" active={status === "delivered"} onClick={() => { setStatus("delivered"); setPage(1); }} />
        <SummaryTile label="Partial" value={String(operational.partial_delivered)} accent="#b45309" active={status === "partial_delivered"} onClick={() => { setStatus("partial_delivered"); setPage(1); }} />
        <SummaryTile label="Refuse" value={String(operational.refuse_return)} accent="var(--red)" active={status === "refuse_return"} onClick={() => { setStatus("refuse_return"); setPage(1); }} />
        <SummaryTile label="Cancelled" value={String(operational.cancelled)} accent="var(--text-faint)" active={status === "cancelled"} onClick={() => { setStatus("cancelled"); setPage(1); }} />
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

      {/* Bulk action bar (Steadfast dispatch or Settlement) */}
      {selected.size > 0 && (
        <div className="card flex flex-wrap items-center justify-between gap-3 p-3.5">
          <div className="text-[13px]" style={{ color: "var(--text)" }}>
            <b>{selected.size}</b> order{selected.size === 1 ? "" : "s"} selected
            {selectedOrders.length > 0 && (
              <span className="ml-2 text-[12px]" style={{ color: "var(--text-faint)" }}>
                Dispatchable: {selectedOrders.length} (COD {formatTaka(selectedOrders.reduce((s, o) => s + expectedCod(o), 0), 2)})
              </span>
            )}
            {selectedSettlableOrders.length > 0 && (
              <span className="ml-2 text-[12px]" style={{ color: "var(--brand)" }}>
                Settable: {selectedSettlableOrders.length} (Pending {formatTaka(selectedSettlableOrders.reduce((s, o) => {
                  const r = getRow(o.id);
                  return s + (r ? r.pending : Math.max(0, (o.delivery.customerPaid || expectedCod(o)) - (o.courier.forwardCost || 0)));
                }, 0), 2)})
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setSelected(new Set())} className="focus-ring rounded-xl border px-3 py-2 text-[12.5px] font-medium" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
              Clear
            </button>
            {selectedOrders.length > 0 && (
              <button
                onClick={() => setConfirmBulk(true)}
                disabled={dispatching || !steadfastEnabled}
                className="focus-ring flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
                style={{ background: "var(--brand)" }}
              >
                <Truck size={15} />
                {dispatching && dispatchProgress ? `Sending ${dispatchProgress.done + 1}/${dispatchProgress.total}…` : `Send to Steadfast (${selectedOrders.length})`}
              </button>
            )}
            {selectedSettlableOrders.length > 0 && (
              <button
                onClick={() => setConfirmBulkSettle(true)}
                disabled={settling}
                className="focus-ring flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
                style={{ background: "var(--green)" }}
              >
                <CheckCircle2 size={15} />
                {settling ? "Recording settlement..." : `Mark as Settled (${selectedSettlableOrders.length})`}
              </button>
            )}
          </div>
          {!steadfastEnabled && selectedOrders.length > 0 && (
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
                    disabled={pageSelectableIds.length === 0}
                    aria-label="Select all eligible orders on this page"
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
                <th className="px-3 py-3 font-medium">Settlement</th>
                <th className="px-3 py-3 font-medium">Date</th>
                <th className="w-10 px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {pageItems.map((o) => {
                const sRow = getRow(o.id);
                const sStatus = sRow ? sRow.status : (o.delivery.settlementStatus === "settled" ? "Settled" : "Unsettled");
                const isFullySettled = sStatus === "Settled";
                const isDeliveredOrPartial = o.status === "delivered" || o.status === "partial_delivered";

                return (
                  <tr key={o.id} className="border-t" style={{ borderColor: "var(--border-soft)" }}>
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(o.id)}
                        onChange={() => toggleSelected(o.id)}
                        disabled={!isSelectable(o)}
                        aria-label={`Select order #${o.orderNumber}`}
                        title={isFullySettled ? "This order is already fully settled" : undefined}
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
                  <td className="px-3 py-3">
                    {isDeliveredOrPartial ? (
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap"
                        style={{
                          color: isFullySettled ? "var(--green)" : sStatus === "Partially Settled" ? "var(--blue)" : "#b45309",
                          background: isFullySettled ? "var(--green-soft)" : sStatus === "Partially Settled" ? "var(--blue-soft)" : "rgba(180, 83, 9, 0.14)",
                        }}
                      >
                        {isFullySettled ? "✓ Settled" : sStatus === "Partially Settled" ? `Partial (Pending: ৳${sRow?.pending ?? 0})` : "Unsettled"}
                      </span>
                    ) : (
                      <span className="text-[11.5px]" style={{ color: "var(--text-faint)" }}>—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-[12px]" style={{ color: "var(--text-faint)" }}>
                    {new Date(o.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <RowActionsMenu actions={rowActionsFor(o)} />
                  </td>
                </tr>
              );
            })}
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
        open={confirmBulkSettle}
        title="Mark as Settled (Bulk)"
        message={`Record settlement for ${selectedSettlableOrders.length} order(s) with total pending amount of ${formatTaka(selectedSettlableOrders.reduce((s, o) => {
          const r = getRow(o.id);
          return s + (r ? r.pending : Math.max(0, (o.delivery.customerPaid || expectedCod(o)) - (o.courier.forwardCost || 0)));
        }, 0), 2)}? These orders will be marked as Settled and cannot be settled again.`}
        confirmLabel="Confirm Settlement"
        onCancel={() => setConfirmBulkSettle(false)}
        onConfirm={handleBulkSettlement}
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

function SummaryTile({ label, value, accent, active, onClick }: { label: string; value: string; accent?: string; active?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`card p-3.5 text-left transition-all ${onClick ? "cursor-pointer hover:border-[var(--brand)] focus-ring" : ""}`}
      style={{
        borderColor: active ? "var(--brand)" : undefined,
        boxShadow: active ? "0 0 0 1px var(--brand)" : undefined,
        width: "100%",
      }}
    >
      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
        {label}
      </p>
      <p className="mt-1 text-[16px] font-semibold" style={{ color: accent ?? "var(--text)" }}>
        {value}
      </p>
    </button>
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
