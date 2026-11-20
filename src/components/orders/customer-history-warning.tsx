"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Info } from "lucide-react";
import { buildPhoneVariants } from "@/lib/customers/phone";
import type { CustomerLookupResult } from "@/lib/customers/types";
import { formatDate } from "@/lib/settings/runtime";
import { ORDER_STATUS_LABELS } from "@/lib/orders/utils";

/**
 * Read-only, non-blocking customer history hint. A failed lookup is deliberately silent: staff can
 * always save an order even when this endpoint is down. `excludeOrderId` keeps an order being edited
 * from being reported as its own duplicate.
 */
export function CustomerHistoryWarning({ phone, excludeOrderId }: { phone: string; excludeOrderId?: string }) {
  const [result, setResult] = useState<CustomerLookupResult | null>(null);
  const { valid, local } = buildPhoneVariants(phone);

  useEffect(() => {
    if (!valid) return;

    const controller = new AbortController();
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ phone: local });
        if (excludeOrderId) params.set("exclude", excludeOrderId);
        const res = await fetch(`/api/customers/lookup?${params.toString()}`, { signal: controller.signal, cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as CustomerLookupResult;
        if (!cancelled) setResult(data.found ? data : null);
      } catch {
        // Lookup failure must never show a toast or block the form.
      }
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [valid, local, excludeOrderId]);

  if (!valid || !result) return null;

  const refusals = result.counts.refuse_return ?? 0;
  const active = result.activeOrders[0];
  const tone = refusals > 0 ? "red" : active ? "amber" : result.total > 0 ? "neutral" : null;
  if (!tone) return null;

  const style =
    tone === "red"
      ? { borderColor: "var(--red)", background: "var(--red-soft)", color: "var(--red)" }
      : tone === "amber"
        ? { borderColor: "var(--brand-tint-border)", background: "var(--brand-soft)", color: "var(--brand-strong)" }
        : { borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--text-muted)" };
  const Icon = tone === "neutral" ? Info : AlertTriangle;
  const delivered = result.counts.delivered ?? 0;
  const reason = result.lastRefusalReason;
  const activeStatusLabel = active ? (ORDER_STATUS_LABELS[active.status]?.toLowerCase() ?? active.status) : "";

  return (
    <div className={`mt-2 flex items-start gap-2 rounded-xl border px-3 py-2 text-[12.5px] ${tone === "red" ? "font-medium" : ""}`} style={style} role="status">
      <Icon size={15} className="mt-0.5 shrink-0" />
      <div className="leading-snug">
        {tone === "red" && (
          <span>
            Refused/returned {refusals} {refusals === 1 ? "time" : "times"}.
            {result.lastRefusal?.orderNumber ? ` Last: #${result.lastRefusal.orderNumber}.` : ""}
            {reason ? ` Reason: ${reason}.` : ""}
          </span>
        )}
        {tone === "amber" && active && (
          <span>
            Active order{" "}
            <Link href={`/orders/${active.id}`} className="font-semibold hover:underline" style={{ color: "inherit" }}>
              #{active.orderNumber}
            </Link>{" "}
            ({activeStatusLabel}) already exists for this number. Possible duplicate.
          </span>
        )}
        {tone === "neutral" && (
          <span>
            {result.total} earlier {result.total === 1 ? "order" : "orders"}, {delivered} delivered
            {result.lastOrder ? `, last #${result.lastOrder.orderNumber} on ${formatDate(result.lastOrder.createdAt)}` : ""}.
          </span>
        )}
      </div>
    </div>
  );
}
