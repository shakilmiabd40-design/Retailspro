"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { useNotifications } from "@/lib/notifications/store";
import { timeAgo } from "@/lib/dashboard";
import { InventoryStatusBadge } from "./badges";
import { useAccess } from "@/lib/settings/access";
import type { InventoryNotification, NewOrderNotification, OrderCodUpdate } from "@/lib/notifications/types";

const SEVERITY_RANK = { critical: 0, warning: 1, info: 2 } as const;
type BellItem =
  | { kind: "stock"; data: InventoryNotification; rank: number }
  | { kind: "courier"; data: OrderCodUpdate; rank: number }
  | { kind: "order"; data: NewOrderNotification; rank: number };

export function NotificationBell() {
  const { notifications, orderUpdates, newOrders, unreadCount, markRead, markAllRead, markOrderUpdateRead, markNewOrderRead } = useNotifications();
  const { currentRole } = useAccess();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Show all notification types that contribute to the unread badge.
  const items: BellItem[] = [
    ...notifications
      .filter((n) => !n.read || n.state !== "resolved")
      .map((n) => ({ kind: "stock" as const, data: n, rank: SEVERITY_RANK[n.severity] })),
    ...orderUpdates.filter((n) => !n.read).map((n) => ({ kind: "courier" as const, data: n, rank: 0 })),
    ...newOrders
      .filter((n) => !n.read && n.roleIds.includes(currentRole.id))
      .map((n) => ({ kind: "order" as const, data: n, rank: 0 })),
  ].sort((a, b) => a.rank - b.rank || b.data.timestamp.localeCompare(a.data.timestamp)).slice(0, 6);

  return (
    <div ref={rootRef} className="relative">
      <button
        aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="focus-ring relative flex h-9 w-9 items-center justify-center rounded-full border"
        style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
      >
        <Bell size={17} />
        {unreadCount > 0 && (
          <span
            className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9.5px] font-bold text-white"
            style={{ background: "var(--red)" }}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="card fixed right-2 top-16 z-50 flex max-h-[calc(100dvh-5rem)] w-[min(380px,calc(100vw-1rem))] flex-col overflow-hidden shadow-xl sm:absolute sm:right-0 sm:top-11 sm:max-h-[min(80vh,560px)] sm:w-[min(92vw,380px)]"
          style={{ background: "var(--surface)" }}
          role="dialog"
          aria-label="Notifications"
        >
          <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
            <p className="text-[13.5px] font-semibold" style={{ color: "var(--text)" }}>
              Notifications
            </p>
            <button
              onClick={markAllRead}
              disabled={unreadCount === 0}
              className="focus-ring rounded-md text-[12px] font-medium disabled:opacity-40"
              style={{ color: "var(--brand)" }}
            >
              Mark all read
            </button>
          </div>

          {items.length === 0 ? (
            <p className="px-4 py-10 text-center text-[12.5px]" style={{ color: "var(--text-muted)" }}>
              All caught up. New order and stock alerts will show up here.
            </p>
          ) : (
            <div className="min-h-0 max-h-[calc(100dvh-11rem)] divide-y overflow-y-auto sm:max-h-[420px]" style={{ borderColor: "var(--border-soft)" }}>
              {items.map((item) => {
                const title = item.kind === "stock" ? item.data.productName : item.kind === "order" ? `New order #${item.data.orderNumber}` : `Courier update #${item.data.orderNumber}`;
                const detail = item.kind === "stock"
                  ? `${item.data.color} / ${item.data.size} · ${item.data.quantityOnHand} available`
                  : item.kind === "order"
                    ? item.data.customerName
                    : `COD changed to ৳${item.data.currentAmount.toLocaleString()}`;
                return (
                  <button
                    key={`${item.kind}:${item.data.id}`}
                    onClick={() => {
                      if (item.kind === "stock") {
                        markRead(item.data.id);
                        setOpen(false);
                        router.push(`/notifications/${item.data.id}`);
                      } else {
                        if (item.kind === "order") markNewOrderRead(item.data.id);
                        else markOrderUpdateRead(item.data.id);
                        setOpen(false);
                        router.push(`/orders/${item.data.orderId}`);
                      }
                    }}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--surface-2)]"
                  >
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: item.data.read ? "transparent" : "var(--brand)" }} />
                    <span className="min-w-0 flex-1">
                      <span className="mb-1 flex items-center justify-between gap-2">
                        {item.kind === "stock" ? <InventoryStatusBadge status={item.data.status} /> : <span className="text-[11px] font-semibold" style={{ color: "var(--brand-strong)" }}>{item.kind === "order" ? "New order" : "Courier COD"}</span>}
                        <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>
                          {timeAgo(item.data.timestamp)}
                        </span>
                      </span>
                      <span className="block truncate text-[13px] font-medium" style={{ color: "var(--text)" }}>
                        {title}
                      </span>
                      <span className="block truncate text-[12px]" style={{ color: "var(--text-muted)" }}>
                        {detail}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="focus-ring block border-t px-4 py-3 text-center text-[12.5px] font-medium"
            style={{ borderColor: "var(--border)", color: "var(--brand)" }}
          >
            View all notifications
          </Link>
        </div>
      )}
    </div>
  );
}
