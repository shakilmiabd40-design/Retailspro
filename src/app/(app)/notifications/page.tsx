"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckCheck, Search, Settings2, Trash2 } from "lucide-react";
import { useNotifications } from "@/lib/notifications/store";
import { timeAgo } from "@/lib/dashboard";
import { OWNER_ROLE_LABELS, STATUS_LABELS } from "@/lib/notifications/engine";
import type { InventoryStatus, Severity } from "@/lib/notifications/types";
import { useToast } from "@/components/toast";
import { InventoryStatusBadge, SeverityBadge, StateChip, STATUS_STYLES } from "@/components/notifications/badges";

type Tab = "alerts" | "board";
type StateFilter = "active" | "resolved" | "all";

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
const STATUS_ORDER: InventoryStatus[] = ["out_of_stock", "critical", "replenish", "hold_blocked", "in_progress", "monitor", "on_target"];
const TILE_STATUSES: InventoryStatus[] = ["out_of_stock", "critical", "replenish", "monitor", "in_progress", "hold_blocked"];

const selectStyle = { borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" };

export default function NotificationsPage() {
  const { notifications, board, hydrated, unreadCount, markAllRead, acknowledge, acknowledgeAll, clearResolved } = useNotifications();
  const showToast = useToast();

  const [tab, setTab] = useState<Tab>("alerts");
  const [stateFilter, setStateFilter] = useState<StateFilter>("active");
  const [statusFilter, setStatusFilter] = useState<InventoryStatus | "all">("all");
  const [severityFilter, setSeverityFilter] = useState<Severity | "all">("all");
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const matchesQuery = (name: string, sku: string) => !q || name.toLowerCase().includes(q) || sku.toLowerCase().includes(q);

  const alerts = useMemo(
    () =>
      notifications
        .filter((n) => (stateFilter === "all" ? true : stateFilter === "resolved" ? n.state === "resolved" : n.state !== "resolved"))
        .filter((n) => statusFilter === "all" || n.status === statusFilter)
        .filter((n) => severityFilter === "all" || n.severity === severityFilter)
        .filter((n) => matchesQuery(n.productName, n.sku))
        .sort((a, b) =>
          stateFilter === "active"
            ? SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.timestamp.localeCompare(a.timestamp)
            : b.timestamp.localeCompare(a.timestamp)
        ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [notifications, stateFilter, statusFilter, severityFilter, q]
  );

  const boardCounts = useMemo(() => {
    const counts = {} as Record<InventoryStatus, number>;
    for (const s of STATUS_ORDER) counts[s] = 0;
    for (const row of board) counts[row.status] += 1;
    return counts;
  }, [board]);

  const boardRows = useMemo(
    () =>
      board
        .filter((r) => statusFilter === "all" || r.status === statusFilter)
        .filter((r) => matchesQuery(r.productName, r.sku))
        .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || a.available - b.available),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [board, statusFilter, q]
  );

  const activeCount = notifications.filter((n) => n.state !== "resolved").length;
  const unackCount = notifications.filter((n) => n.state === "open").length;
  const hasResolved = notifications.some((n) => n.state === "resolved");

  if (!hydrated) return <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading…</p>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold" style={{ color: "var(--text)" }}>
            Notifications
          </h1>
          <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
            {activeCount} active · {unackCount} waiting for acknowledgement
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              acknowledgeAll();
              markAllRead();
              showToast("All notifications acknowledged");
            }}
            disabled={unackCount === 0 && unreadCount === 0}
            className="focus-ring flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-[13px] font-medium disabled:opacity-40"
            style={{ borderColor: "var(--border)", color: "var(--text)" }}
          >
            <CheckCheck size={14} />
            Acknowledge all
          </button>
          <Link
            href="/notifications/settings"
            className="focus-ring flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-[13px] font-medium"
            style={{ borderColor: "var(--border)", color: "var(--text)" }}
          >
            <Settings2 size={14} />
            Thresholds &amp; routing
          </Link>
        </div>
      </div>

      {/* Status tiles — each one filters the stock status view */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {TILE_STATUSES.map((s) => {
          const active = tab === "board" && statusFilter === s;
          return (
            <button
              key={s}
              onClick={() => {
                setTab("board");
                setStatusFilter(active ? "all" : s);
              }}
              className="focus-ring card p-3.5 text-left transition-colors"
              style={{ outline: active ? `2px solid ${STATUS_STYLES[s].color}` : undefined }}
            >
              <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                {STATUS_LABELS[s]}
              </p>
              <p className="mt-1 text-[22px] font-semibold" style={{ color: boardCounts[s] ? STATUS_STYLES[s].color : "var(--text-faint)" }}>
                {boardCounts[s]}
              </p>
            </button>
          );
        })}
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b p-4" style={{ borderColor: "var(--border)" }}>
          <div className="flex gap-1 rounded-lg p-1" style={{ background: "var(--surface-2)" }}>
            {(
              [
                ["alerts", "Alerts"],
                ["board", "Stock status"],
              ] as [Tab, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => {
                  setTab(key);
                  setStatusFilter("all");
                }}
                className="focus-ring rounded-md px-3 py-1.5 text-[12.5px] font-medium"
                style={{ background: tab === key ? "var(--brand)" : "transparent", color: tab === key ? "#fff" : "var(--text-muted)" }}
              >
                {label}
              </button>
            ))}
          </div>

          <label className="flex min-w-[180px] flex-1 items-center gap-2 rounded-xl border px-3 py-2" style={{ borderColor: "var(--border)" }}>
            <Search size={14} style={{ color: "var(--text-faint)" }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search product or SKU"
              className="w-full bg-transparent text-[13px] outline-none"
              style={{ color: "var(--text)" }}
            />
          </label>

          {tab === "alerts" && (
            <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value as StateFilter)} className="focus-ring rounded-xl border px-3 py-2 text-[13px]" style={selectStyle} aria-label="State">
              <option value="active">Active</option>
              <option value="resolved">Resolved</option>
              <option value="all">All</option>
            </select>
          )}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as InventoryStatus | "all")}
            className="focus-ring rounded-xl border px-3 py-2 text-[13px]"
            style={selectStyle}
            aria-label="Status"
          >
            <option value="all">All statuses</option>
            {STATUS_ORDER.filter((s) => tab === "board" || s !== "on_target").map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
            {tab === "alerts" && <option value="complete">{STATUS_LABELS.complete}</option>}
          </select>
          {tab === "alerts" && (
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value as Severity | "all")}
              className="focus-ring rounded-xl border px-3 py-2 text-[13px]"
              style={selectStyle}
              aria-label="Severity"
            >
              <option value="all">All severities</option>
              <option value="critical">Critical</option>
              <option value="warning">Warning</option>
              <option value="info">Info</option>
            </select>
          )}
        </div>

        {tab === "alerts" ? (
          alerts.length === 0 ? (
            <p className="px-4 py-14 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>
              {notifications.length === 0 ? "No alerts yet. Stock levels are within your thresholds." : "No notifications match these filters."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse text-left text-[13px]">
                <thead>
                  <tr className="text-[11.5px]" style={{ color: "var(--text-faint)", background: "var(--surface-2)" }}>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium">Item</th>
                    <th className="px-4 py-2.5 font-medium">Stock</th>
                    <th className="px-4 py-2.5 font-medium">Owner</th>
                    <th className="px-4 py-2.5 font-medium">State</th>
                    <th className="px-4 py-2.5 font-medium">When</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {alerts.map((n) => (
                    <tr key={n.id} className="border-t align-top" style={{ borderColor: "var(--border-soft)" }}>
                      <td className="px-4 py-3">
                        <div className="flex flex-col items-start gap-1.5">
                          <InventoryStatusBadge status={n.status} />
                          <SeverityBadge severity={n.severity} />
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/notifications/${n.id}`} className="focus-ring flex items-center gap-2 rounded-md font-medium hover:underline" style={{ color: "var(--text)" }}>
                          {!n.read && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--brand)" }} aria-label="Unread" />}
                          {n.productName}
                        </Link>
                        <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                          {n.color} / {n.size} · {n.sku}
                        </p>
                      </td>
                      <td className="px-4 py-3" style={{ color: "var(--text)" }}>
                        {n.quantityOnHand} available
                        {n.thresholdValue !== null && n.thresholdType !== "zero_stock" && (
                          <p className="text-[12px]" style={{ color: "var(--text-faint)" }}>
                            limit {n.thresholdValue}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3" style={{ color: "var(--text-muted)" }}>
                        {OWNER_ROLE_LABELS[n.ownerRole]}
                        {n.assignee && <p className="text-[12px]" style={{ color: "var(--text-faint)" }}>{n.assignee}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <StateChip n={n} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-[12px]" style={{ color: "var(--text-faint)" }}>
                        {timeAgo(n.timestamp)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {n.state === "open" ? (
                          <button
                            onClick={() => {
                              acknowledge(n.id);
                              showToast("Acknowledged");
                            }}
                            className="focus-ring rounded-lg border px-2.5 py-1 text-[12px] font-medium"
                            style={{ borderColor: "var(--border)", color: "var(--text)" }}
                          >
                            Acknowledge
                          </button>
                        ) : (
                          <Link href={`/notifications/${n.id}`} className="focus-ring rounded-md text-[12px] font-medium" style={{ color: "var(--brand)" }}>
                            View
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : boardRows.length === 0 ? (
          <p className="px-4 py-14 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>
            {board.length === 0 ? "No tracked items yet. Add products to see their stock status." : "No items match these filters."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-[13px]">
              <thead>
                <tr className="text-[11.5px]" style={{ color: "var(--text-faint)", background: "var(--surface-2)" }}>
                  <th className="px-4 py-2.5 font-medium">Item</th>
                  <th className="px-4 py-2.5 font-medium">SKU</th>
                  <th className="px-4 py-2.5 font-medium">Available</th>
                  <th className="px-4 py-2.5 font-medium">On hand / reserved</th>
                  <th className="px-4 py-2.5 font-medium">Incoming</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Since</th>
                </tr>
              </thead>
              <tbody>
                {boardRows.map((r) => (
                  <tr key={r.variantId} className="border-t" style={{ borderColor: "var(--border-soft)" }}>
                    <td className="px-4 py-2.5">
                      <Link href={`/products/${r.productId}`} className="focus-ring rounded-md font-medium hover:underline" style={{ color: "var(--text)" }}>
                        {r.productName}
                      </Link>
                      <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                        {r.color} / {r.size}
                      </p>
                    </td>
                    <td className="px-4 py-2.5 text-[12px]" style={{ color: "var(--text-muted)" }}>
                      {r.sku}
                    </td>
                    <td className="px-4 py-2.5 font-semibold" style={{ color: "var(--text)" }}>
                      {r.available}
                    </td>
                    <td className="px-4 py-2.5" style={{ color: "var(--text-muted)" }}>
                      {r.physicalStock} / {r.reserved}
                    </td>
                    <td className="px-4 py-2.5" style={{ color: "var(--text-muted)" }}>
                      {r.incoming ? `${r.incoming.qty} (${r.incoming.poNumber})` : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <InventoryStatusBadge status={r.status} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-[12px]" style={{ color: "var(--text-faint)" }}>
                      {r.since ? timeAgo(r.since) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "alerts" && hasResolved && stateFilter !== "active" && (
          <div className="flex justify-end border-t p-3" style={{ borderColor: "var(--border)" }}>
            <button
              onClick={() => {
                clearResolved();
                showToast("Resolved notifications cleared");
              }}
              className="focus-ring flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium"
              style={{ color: "var(--text-muted)" }}
            >
              <Trash2 size={13} />
              Clear resolved
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
