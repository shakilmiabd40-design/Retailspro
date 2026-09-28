import type { POStatus } from "@/lib/purchase-orders/types";
import { PO_STATUS_LABELS } from "@/lib/purchase-orders/utils";

const STYLES: Record<POStatus, { color: string; bg: string }> = {
  draft: { color: "var(--text-muted)", bg: "var(--surface-2)" },
  approved: { color: "var(--blue)", bg: "var(--blue-soft)" },
  sent: { color: "var(--brand)", bg: "var(--brand-soft)" },
  partially_received: { color: "#b45309", bg: "rgba(180, 83, 9, 0.14)" },
  received: { color: "var(--green)", bg: "var(--green-soft)" },
  cancelled: { color: "var(--red)", bg: "var(--red-soft)" },
};

export function PoStatusBadge({ status }: { status: POStatus }) {
  const s = STYLES[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium whitespace-nowrap"
      style={{ color: s.color, background: s.bg }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
      {PO_STATUS_LABELS[status]}
    </span>
  );
}
