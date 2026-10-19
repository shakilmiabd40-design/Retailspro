"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { useNotifications } from "@/lib/notifications/store";
import { timeAgo } from "@/lib/dashboard";
import { InventoryStatusBadge } from "./badges";

const SEVERITY_RANK = { critical: 0, warning: 1, info: 2 } as const;

export function NotificationBell() {
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Worst first, then newest. Shows what is unread or still needs action.
  const items = notifications
    .filter((n) => !n.read || n.state !== "resolved")
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.timestamp.localeCompare(a.timestamp))
    .slice(0, 6);

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
          className="card absolute right-0 top-11 z-50 w-[min(92vw,380px)] overflow-hidden shadow-xl"
          style={{ background: "var(--surface)" }}
          role="dialog"
          aria-label="Inventory notifications"
        >
          <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
            <p className="text-[13.5px] font-semibold" style={{ color: "var(--text)" }}>
              Notifications
            </p>
            <button
              onClick={markAllRead}
              disabled={!items.some((n) => !n.read)}
              className="focus-ring rounded-md text-[12px] font-medium disabled:opacity-40"
              style={{ color: "var(--brand)" }}
            >
              Mark all read
            </button>
          </div>

          {items.length === 0 ? (
            <p className="px-4 py-10 text-center text-[12.5px]" style={{ color: "var(--text-muted)" }}>
              All caught up. Stock alerts will show up here.
            </p>
          ) : (
            <div className="max-h-[420px] divide-y overflow-y-auto" style={{ borderColor: "var(--border-soft)" }}>
              {items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => {
                    markRead(n.id);
                    setOpen(false);
                    router.push(`/notifications/${n.id}`);
                  }}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--surface-2)]"
                >
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: n.read ? "transparent" : "var(--brand)" }} />
                  <span className="min-w-0 flex-1">
                    <span className="mb-1 flex items-center justify-between gap-2">
                      <InventoryStatusBadge status={n.status} />
                      <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>
                        {timeAgo(n.timestamp)}
                      </span>
                    </span>
                    <span className="block truncate text-[13px] font-medium" style={{ color: "var(--text)" }}>
                      {n.productName}
                    </span>
                    <span className="block truncate text-[12px]" style={{ color: "var(--text-muted)" }}>
                      {n.color} / {n.size} · {n.quantityOnHand} available
                    </span>
                  </span>
                </button>
              ))}
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
