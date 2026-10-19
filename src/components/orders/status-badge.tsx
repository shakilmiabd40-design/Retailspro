import type { OrderStatus } from "@/lib/orders/types";
import { ORDER_STATUS_LABELS } from "@/lib/orders/utils";

const STYLES: Record<OrderStatus, { color: string; bg: string }> = {
  pending: { color: "var(--text-muted)", bg: "var(--surface-2)" },
  processing: { color: "var(--brand)", bg: "var(--brand-soft)" },
  in_transit: { color: "var(--blue)", bg: "var(--blue-soft)" },
  delivered: { color: "var(--green)", bg: "var(--green-soft)" },
  partial_delivered: { color: "#b45309", bg: "rgba(180, 83, 9, 0.14)" },
  refuse_return: { color: "var(--red)", bg: "var(--red-soft)" },
  cancelled: { color: "var(--text-faint)", bg: "var(--surface-2)" },
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const s = STYLES[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium whitespace-nowrap"
      style={{ color: s.color, background: s.bg }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
      {ORDER_STATUS_LABELS[status]}
    </span>
  );
}
