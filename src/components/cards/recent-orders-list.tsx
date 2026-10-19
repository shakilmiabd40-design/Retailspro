"use client";

import Link from "next/link";
import { Package } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { timeAgo } from "@/lib/dashboard";
import { OrderStatusBadge } from "@/components/orders/status-badge";
import type { RecentOrderRow } from "@/lib/types";

export function RecentOrdersList({ data }: { data: RecentOrderRow[] }) {
  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>
          Recent Orders
        </p>
        <Link href="/orders" className="focus-ring rounded-md text-[12px] font-medium" style={{ color: "var(--brand)" }}>
          View all
        </Link>
      </div>

      {data.length === 0 ? (
        <p className="py-10 text-center text-[12.5px]" style={{ color: "var(--text-muted)" }}>
          No orders yet.
        </p>
      ) : (
        <div className="space-y-1">
          {data.map((order) => (
            <Link
              key={order.id}
              href={`/orders/${order.id}`}
              className="flex items-center justify-between gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-[var(--surface-2)]"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: "var(--brand-soft)", color: "var(--brand)" }}>
                  <Package size={16} />
                </span>
                <div>
                  <p className="text-[13px] font-medium" style={{ color: "var(--text)" }}>
                    #{order.orderNumber}
                  </p>
                  <p className="text-[11.5px]" style={{ color: "var(--text-faint)" }}>
                    {order.customerName}
                  </p>
                </div>
              </div>

              <div className="text-right">
                <p className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>
                  {formatCurrency(order.amount, { decimals: 2 })}
                </p>
                <div className="mt-0.5 flex items-center justify-end gap-1.5">
                  <OrderStatusBadge status={order.status} />
                </div>
                <p className="mt-1 text-[11px]" style={{ color: "var(--text-faint)" }}>
                  {timeAgo(order.createdAt)}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
