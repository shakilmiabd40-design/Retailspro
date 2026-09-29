import type { InventoryNotification, InventoryStatus, Severity } from "@/lib/notifications/types";
import { STATUS_LABELS } from "@/lib/notifications/engine";

export const STATUS_STYLES: Record<InventoryStatus, { color: string; bg: string }> = {
  on_target: { color: "var(--green)", bg: "var(--green-soft)" },
  monitor: { color: "var(--blue)", bg: "var(--blue-soft)" },
  replenish: { color: "#b45309", bg: "rgba(180, 83, 9, 0.14)" },
  critical: { color: "var(--red)", bg: "var(--red-soft)" },
  out_of_stock: { color: "var(--red)", bg: "var(--red-soft)" },
  hold_blocked: { color: "#7c3aed", bg: "rgba(124, 58, 237, 0.14)" },
  in_progress: { color: "var(--brand)", bg: "var(--brand-soft)" },
  complete: { color: "var(--green)", bg: "var(--green-soft)" },
};

export function InventoryStatusBadge({ status }: { status: InventoryStatus }) {
  const s = STATUS_STYLES[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11.5px] font-medium"
      style={{ color: s.color, background: s.bg }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
      {STATUS_LABELS[status]}
    </span>
  );
}

const SEVERITY_STYLES: Record<Severity, { color: string; bg: string; label: string }> = {
  info: { color: "var(--blue)", bg: "var(--blue-soft)", label: "Info" },
  warning: { color: "#b45309", bg: "rgba(180, 83, 9, 0.14)", label: "Warning" },
  critical: { color: "var(--red)", bg: "var(--red-soft)", label: "Critical" },
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  const s = SEVERITY_STYLES[severity];
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold" style={{ color: s.color, background: s.bg }}>
      {s.label}
    </span>
  );
}

/** Lifecycle chip: what still needs a human. */
export function StateChip({ n }: { n: Pick<InventoryNotification, "state" | "escalatedAt" | "resolution"> }) {
  let label = "Unacknowledged";
  let color = "var(--text)";
  let bg = "var(--surface-2)";
  if (n.state === "resolved") {
    label = "Resolved";
    color = "var(--text-faint)";
  } else if (n.state === "acknowledged") {
    label = "Acknowledged";
    color = "var(--green)";
    bg = "var(--green-soft)";
  } else if (n.escalatedAt) {
    label = "Escalated";
    color = "var(--red)";
    bg = "var(--red-soft)";
  }
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-medium" style={{ color, background: bg }}>
      {label}
    </span>
  );
}
