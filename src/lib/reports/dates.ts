/** Date helpers and the global filter model shared by every report page. */

export type DateTypeKey =
  | "order_created"
  | "delivered"
  | "dispatch"
  | "final_status"
  | "return_received"
  | "return_requested"
  | "po_created"
  | "grn"
  | "warranty_start"
  | "claim_submitted"
  | "settlement_paid"
  | "pos_sale";

export const DATE_TYPE_LABELS: Record<DateTypeKey, string> = {
  order_created: "Order Created Date",
  delivered: "Delivered Date",
  dispatch: "Dispatch / In Transit Date",
  final_status: "Final Status Date (Delivered/Partial/Refuse)",
  return_received: "Return Received Date",
  return_requested: "Return Requested Date",
  po_created: "PO Created Date",
  grn: "Stock Received (GRN) Date",
  warranty_start: "Warranty Start Date",
  claim_submitted: "Claim Submitted Date",
  settlement_paid: "Settlement Paid Date",
  pos_sale: "Date",
};

export type PresetKey = "today" | "yesterday" | "last7" | "last30" | "this_month" | "last_month";

export const PRESETS: { key: PresetKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last7", label: "Last 7 days" },
  { key: "last30", label: "Last 30 days" },
  { key: "this_month", label: "This Month" },
  { key: "last_month", label: "Last Month" },
];

export type GroupBy = "daily" | "weekly" | "monthly";
export type SettlementLabel = "Unsettled" | "Partially Settled" | "Settled";

export interface ReportFilters {
  from: string; // YYYY-MM-DD, inclusive
  to: string; // YYYY-MM-DD, inclusive
  preset: PresetKey | "custom";
  dateType: DateTypeKey;
  groupBy: GroupBy;
  status: string; // OrderStatus | "all"
  courier: string; // company | "all"
  supplierId: string; // id | "all"
  category: string;
  brand: string;
  productId: string;
  sku: string; // free-text contains
  settlementStatus: SettlementLabel | "all";
}

// ---- local-day helpers ----------------------------------------------------

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

export function toKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Date-only strings ("2026-09-18") are local calendar days; anything else is an instant. */
export function parseDate(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(value);
}

export function presetRange(key: PresetKey, now: Date = new Date()): { from: string; to: string } {
  const today = startOfDay(now);
  switch (key) {
    case "today":
      return { from: toKey(today), to: toKey(today) };
    case "yesterday": {
      const y = addDays(today, -1);
      return { from: toKey(y), to: toKey(y) };
    }
    case "last7":
      return { from: toKey(addDays(today, -6)), to: toKey(today) };
    case "last30":
      return { from: toKey(addDays(today, -29)), to: toKey(today) };
    case "this_month":
      return { from: toKey(new Date(today.getFullYear(), today.getMonth(), 1)), to: toKey(today) };
    case "last_month":
      return {
        from: toKey(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
        to: toKey(new Date(today.getFullYear(), today.getMonth(), 0)),
      };
  }
}

/** True when the instant falls on a local day inside [from, to]. Missing dates never match. */
export function inRange(date: Date | null | undefined, from: string, to: string): boolean {
  if (!date || Number.isNaN(date.getTime())) return false;
  const k = toKey(date);
  return k >= from && k <= to;
}

export function defaultFilters(dateType: DateTypeKey, groupBy: GroupBy = "daily", now: Date = new Date()): ReportFilters {
  return {
    ...presetRange("last30", now),
    preset: "last30",
    dateType,
    groupBy,
    status: "all",
    courier: "all",
    supplierId: "all",
    category: "all",
    brand: "all",
    productId: "all",
    sku: "",
    settlementStatus: "all",
  };
}

// ---- grouping ---------------------------------------------------------------

export interface Bucket {
  key: string;
  label: string;
}

function mondayOf(d: Date): Date {
  const day = (d.getDay() + 6) % 7; // Monday = 0
  return addDays(startOfDay(d), -day);
}

export function bucketOf(d: Date, groupBy: GroupBy): Bucket {
  if (groupBy === "monthly") {
    return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: d.toLocaleDateString("en-US", { month: "short", year: "numeric" }) };
  }
  if (groupBy === "weekly") {
    const m = mondayOf(d);
    return { key: toKey(m), label: `Wk ${m.toLocaleDateString("en-US", { day: "numeric", month: "short" })}` };
  }
  return { key: toKey(d), label: d.toLocaleDateString("en-US", { day: "numeric", month: "short" }) };
}

/** Every bucket between from and to (empty ones included) so trend charts have no gaps. */
export function bucketsBetween(from: string, to: string, groupBy: GroupBy): Bucket[] {
  const out: Bucket[] = [];
  const seen = new Set<string>();
  let cursor = parseDate(from);
  const end = parseDate(to);
  let guard = 0;
  while (cursor <= end && guard++ < 800) {
    const b = bucketOf(cursor, groupBy);
    if (!seen.has(b.key)) {
      seen.add(b.key);
      out.push(b);
    }
    cursor = addDays(cursor, 1);
  }
  return out;
}

export function formatDay(d: Date | null | undefined): string {
  if (!d || Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}
