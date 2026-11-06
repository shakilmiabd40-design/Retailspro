import type { Order } from "./orders/types";
import { expectedCod, salesRevenue, grossRevenue } from "./orders/utils";
import type { Product } from "./products/types";
import type { LedgerEntry } from "./accounting/types";
import type { PosInvoice } from "./pos/types";
import type {
  DashboardData,
  DistrictShare,
  OrdersChartPoint,
  ProductSalesRow,
  RangeKey,
  SparkPoint,
  TopCategory,
  Trend,
} from "./types";

export const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: "all", label: "All time" },
  { key: "week", label: "Weekly" },
  { key: "month", label: "Monthly" },
];

const CATEGORY_COLORS = ["var(--chart-1)", "var(--chart-4)", "var(--chart-3)", "var(--chart-2)", "var(--chart-5)"];
const OTHER_COLOR = "var(--border)";
const TOP_N = 5;

// ---- date helpers ---------------------------------------------------------

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

function dayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Date-only strings ("2026-09-18", from <input type="date">) are local days; ISO timestamps are converted to local. */
function parseLocal(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(value);
}

/** When a delivered order's revenue counts: its delivery date, falling back to when it was created. */
function revenueDate(order: Order): Date {
  return parseLocal(order.delivery.deliveryDate ?? order.createdAt);
}

function pctTrend(current: number, previous: number): Trend | null {
  if (!previous) return null;
  const value = ((current - previous) / previous) * 100;
  return { value: Math.abs(Math.round(value * 10) / 10), direction: value >= 0 ? "up" : "down" };
}

const inRange = (t: number, from: Date, to: Date) => t >= from.getTime() && t < to.getTime();

/** Normalises phone numbers so "+8801711223344" and "01711223344" are one customer. */
function customerKey(order: Order): string {
  const digits = order.phone.replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits || order.customerName.trim().toLowerCase();
}

// ---- builders --------------------------------------------------------------

/** Orders that still count as demand: everything except Cancelled and Refuse Return. */
function isNetOrder(order: Order): boolean {
  return order.status !== "cancelled" && order.status !== "refuse_return";
}

function shareBreakdown(entries: [string, number][]): { label: string; count: number; pct: number }[] {
  const total = entries.reduce((s, [, n]) => s + n, 0);
  return entries.map(([label, count]) => ({ label, count, pct: total ? Math.round((count / total) * 100) : 0 }));
}

function topWithOther(counts: Map<string, number>, otherLabel = "Other"): [string, number][] {
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, TOP_N);
  const rest = sorted.slice(TOP_N).reduce((s, [, n]) => s + n, 0);
  if (rest > 0) top.push([otherLabel, rest]);
  return top;
}

export interface DashboardDateRange {
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
  label?: string;
  groupBy?: "daily" | "weekly" | "monthly";
}

export function buildDashboard(
  orders: Order[],
  products: Product[],
  now: Date = new Date(),
  ledger: LedgerEntry[] = [],
  invoices: PosInvoice[] = [],
  customRange?: DashboardDateRange
): DashboardData {
  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);

  // Range determination
  const hasCustom = !!customRange && !!customRange.from && !!customRange.to;
  const allTime = customRange?.label?.toLowerCase() === "all time";
  const allTimeDates = allTime
    ? [
        ...orders.flatMap((o) => [o.createdAt, ...(o.status === "delivered" ? [o.delivery.deliveryDate ?? o.createdAt] : [])]),
        ...invoices.map((invoice) => invoice.createdAt),
      ].map((value) => parseLocal(value).getTime()).filter(Number.isFinite)
    : [];
  const earliestActivity = allTimeDates.length ? new Date(Math.min(...allTimeDates)) : null;
  const rangeFrom = allTime && earliestActivity
    ? startOfDay(earliestActivity)
    : hasCustom ? startOfDay(parseLocal(customRange.from)) : addDays(today, -29);
  const rangeTo = hasCustom ? addDays(startOfDay(parseLocal(customRange.to)), 1) : tomorrow; // exclusive upper bound
  
  // Previous comparison range of equal length
  const durationMs = Math.max(86400000, rangeTo.getTime() - rangeFrom.getTime());
  const prevFrom = new Date(rangeFrom.getTime() - durationMs);
  const prevTo = new Date(rangeFrom.getTime());

  const periodDays = Math.max(1, Math.round(durationMs / 86400000));
  const periodLabel = customRange?.label ?? (hasCustom ? `${customRange.from} to ${customRange.to}` : "Last 30 Days");
  const prevLabel = `${periodDays}d prior comparison`;

  const start7 = addDays(today, -6);
  const start30 = rangeFrom;
  const startPrev30 = prevFrom;

  const productById = new Map(products.map((p) => [p.id, p]));
  const variantById = new Map<string, { cost: number }>();
  for (const p of products) for (const v of p.variants) variantById.set(v.id, { cost: v.cost });

  // ---- Orders KPI ----
  const createdAt = (o: Order) => new Date(o.createdAt).getTime();
  const last30 = orders.filter((o) => inRange(createdAt(o), rangeFrom, rangeTo)).length;
  const prev30 = orders.filter((o) => inRange(createdAt(o), prevFrom, rangeFrom)).length;
  const ordersByDay = new Map<string, number>();
  for (const o of orders) {
    const k = dayKey(new Date(o.createdAt));
    ordersByDay.set(k, (ordersByDay.get(k) ?? 0) + 1);
  }
  // Sparkline: if custom range is small (<= 14 days), show each day of the range; otherwise last 7 days of the range
  const sparkDays = Math.min(Math.max(7, periodDays), 14);
  const sparkStart = hasCustom ? rangeFrom : addDays(today, -6);
  const ordersSpark: SparkPoint[] = Array.from({ length: sparkDays }, (_, i) => {
    const d = addDays(sparkStart, i);
    return { label: d.toLocaleDateString("en-US", { day: "numeric" }), value: ordersByDay.get(dayKey(d)) ?? 0 };
  });

  // ---- Net revenue KPI + sales chart (delivered online orders + POS walk-in sales; product sales + delivery billed − courier cost) ----
  const delivered = orders.filter((o) => o.status === "delivered");
  const revenueByDay = new Map<string, number>();
  const grossByDay = new Map<string, number>();
  const grossProfitByDay = new Map<string, number>();
  const netProfitByDay = new Map<string, number>();
  let revLast30 = 0;
  let revPrev30 = 0;
  for (const o of delivered) {
    const when = revenueDate(o);
    const revenue = salesRevenue(o); // net revenue: after courier & other cost
    const gross = grossRevenue(o); // everything the customer paid
    const cost = o.items.reduce((s, i) => s + (variantById.get(i.variantId)?.cost ?? productById.get(i.productId)?.costPrice ?? 0) * i.qty, 0);
    const k = dayKey(when);
    revenueByDay.set(k, (revenueByDay.get(k) ?? 0) + revenue);
    grossByDay.set(k, (grossByDay.get(k) ?? 0) + gross);
    grossProfitByDay.set(k, (grossProfitByDay.get(k) ?? 0) + (gross - cost)); // before courier & other cost
    netProfitByDay.set(k, (netProfitByDay.get(k) ?? 0) + (revenue - cost)); // after courier & other cost
    if (inRange(when.getTime(), rangeFrom, rangeTo)) revLast30 += revenue;
    else if (inRange(when.getTime(), prevFrom, rangeFrom)) revPrev30 += revenue;
  }
  // POS walk-in sales count too — same rule as the Accounting P&L (net of returns; delivery-type POS sales
  // are skipped here because they are Orders and are already counted above).
  for (const inv of invoices) {
    if (inv.status === "void" || inv.saleType === "delivery") continue;
    const k = dayKey(new Date(inv.createdAt));
    let revenue = 0;
    let cost = 0;
    for (const it of inv.items) {
      const kept = Math.max(0, it.qty - (it.returnedQty ?? 0));
      revenue += it.qty > 0 ? (it.net * kept) / it.qty : 0;
      cost += it.cost * kept;
    }
    revenueByDay.set(k, (revenueByDay.get(k) ?? 0) + revenue);
    grossByDay.set(k, (grossByDay.get(k) ?? 0) + revenue);
    grossProfitByDay.set(k, (grossProfitByDay.get(k) ?? 0) + (revenue - cost));
    netProfitByDay.set(k, (netProfitByDay.get(k) ?? 0) + (revenue - cost));
    const t = new Date(inv.createdAt).getTime();
    if (inRange(t, rangeFrom, rangeTo)) revLast30 += revenue;
    else if (inRange(t, prevFrom, rangeFrom)) revPrev30 += revenue;
  }

  // Net profit also carries the day's running expenses (rent, boosting…) and other income from Accounting.
  for (const e of ledger) {
    if (e.kind === "expense") netProfitByDay.set(e.date, (netProfitByDay.get(e.date) ?? 0) - e.amount);
    else if (e.kind === "income") netProfitByDay.set(e.date, (netProfitByDay.get(e.date) ?? 0) + e.amount);
  }
  const revenueSpark: SparkPoint[] = Array.from({ length: sparkDays }, (_, i) => {
    const d = addDays(sparkStart, i);
    return { label: d.toLocaleDateString("en-US", { day: "numeric" }), value: revenueByDay.get(dayKey(d)) ?? 0 };
  });

  const groupBy = customRange?.groupBy ?? (periodDays > 90 ? "monthly" : periodDays > 45 ? "weekly" : "daily");
  const salesChart: OrdersChartPoint[] = [];
  let bucketStart = startOfDay(rangeFrom);
  while (bucketStart < rangeTo) {
    let bucketEnd: Date;
    if (groupBy === "monthly") bucketEnd = new Date(bucketStart.getFullYear(), bucketStart.getMonth() + 1, 1);
    else if (groupBy === "weekly") bucketEnd = addDays(bucketStart, 7);
    else bucketEnd = addDays(bucketStart, 1);
    if (bucketEnd > rangeTo) bucketEnd = rangeTo;
    let income = 0;
    let profit = 0;
    let netProfit = 0;
    for (let day = bucketStart; day < bucketEnd; day = addDays(day, 1)) {
      const k = dayKey(day);
      income += grossByDay.get(k) ?? 0;
      profit += grossProfitByDay.get(k) ?? 0;
      netProfit += netProfitByDay.get(k) ?? 0;
    }
    salesChart.push({
      label: groupBy === "monthly"
        ? bucketStart.toLocaleDateString("en-US", { month: "short", year: "numeric" })
        : groupBy === "weekly"
          ? `${bucketStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${addDays(bucketEnd, -1).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
          : bucketStart.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      income: Math.round(income),
      profit: Math.round(profit),
      netProfit: Math.round(netProfit),
    });
    bucketStart = bucketEnd;
  }

  // ---- Customers KPI ----
  const firstOrderAt = new Map<string, number>();
  const orderCountByCustomer = new Map<string, number>();
  for (const o of orders) {
    const key = customerKey(o);
    const t = createdAt(o);
    const prev = firstOrderAt.get(key);
    if (prev === undefined || t < prev) firstOrderAt.set(key, t);
    orderCountByCustomer.set(key, (orderCountByCustomer.get(key) ?? 0) + 1);
  }
  const totalCustomers = firstOrderAt.size;
  let new30 = 0;
  let newPrev30 = 0;
  let before30 = 0;
  for (const t of firstOrderAt.values()) {
    if (t < rangeFrom.getTime()) before30 += 1;
    if (inRange(t, rangeFrom, rangeTo)) new30 += 1;
    else if (inRange(t, prevFrom, rangeFrom)) newPrev30 += 1;
  }
  const repeatCount = [...orderCountByCustomer.values()].filter((n) => n > 1).length;
  const oneTimeCount = totalCustomers - repeatCount;

  // ---- Categories + districts, per range ----
  const rangeStart: Record<RangeKey, Date | null> = hasCustom
    ? { all: null, week: rangeFrom, month: rangeFrom }
    : { all: null, week: start7, month: start30 };
  const topCategories = {} as Record<RangeKey, TopCategory[]>;
  const topDistricts = {} as Record<RangeKey, DistrictShare[]>;

  for (const range of Object.keys(rangeStart) as RangeKey[]) {
    const from = rangeStart[range];
    const toBound = hasCustom && range !== "all" ? rangeTo : tomorrow;
    const scoped = orders.filter((o) => isNetOrder(o) && (!from || inRange(createdAt(o), from, toBound)));

    const catUnits = new Map<string, number>();
    for (const o of scoped) {
      for (const i of o.items) {
        const cat = productById.get(i.productId)?.category?.trim() || "Uncategorized";
        catUnits.set(cat, (catUnits.get(cat) ?? 0) + i.qty);
      }
    }
    topCategories[range] = shareBreakdown(topWithOther(catUnits)).map((s, idx) => ({
      name: s.label,
      pct: s.pct,
      units: s.count,
      color: s.label === "Other" ? OTHER_COLOR : CATEGORY_COLORS[idx % CATEGORY_COLORS.length],
    }));

    const districtCounts = new Map<string, number>();
    const districtLabel = new Map<string, string>();
    for (const o of scoped) {
      const raw = o.district?.trim();
      const key = raw ? raw.toLowerCase() : "unspecified";
      if (!districtLabel.has(key)) districtLabel.set(key, raw || "Not specified");
      districtCounts.set(key, (districtCounts.get(key) ?? 0) + 1);
    }
    topDistricts[range] = shareBreakdown(topWithOther(districtCounts)).map((s) => ({
      label: districtLabel.get(s.label) ?? s.label,
      pct: s.pct,
      count: s.count,
    }));
  }

  // ---- Product sales table (units across net orders in the selected period if custom, or all time) ----
  const scopedForProducts = hasCustom
    ? orders.filter((o) => isNetOrder(o) && inRange(createdAt(o), rangeFrom, rangeTo))
    : orders.filter(isNetOrder);
  const soldByProduct = new Map<string, { units: number; name: string }>();
  for (const o of scopedForProducts) {
    for (const i of o.items) {
      const cur = soldByProduct.get(i.productId);
      soldByProduct.set(i.productId, { units: (cur?.units ?? 0) + i.qty, name: cur?.name ?? i.productName });
    }
  }
  const productRows: ProductSalesRow[] = [...soldByProduct.entries()]
    .sort((a, b) => b[1].units - a[1].units)
    .slice(0, TOP_N)
    .map(([id, sold]) => {
      const p = productById.get(id);
      const hasDiscount = !!p?.discountPrice && p.discountPrice < p.sellingPrice;
      const salePrice = p ? (hasDiscount ? p.discountPrice! : p.sellingPrice) : 0;
      return {
        id,
        name: p?.name ?? sold.name,
        imageUrl: p?.imageUrl,
        stock: p ? p.variants.reduce((s, v) => s + v.stock, 0) : null,
        oldPrice: hasDiscount ? p!.sellingPrice : null,
        salePrice,
        discountPct: hasDiscount ? Math.round(((p!.sellingPrice - p!.discountPrice!) / p!.sellingPrice) * 100) : 0,
        itemsSold: sold.units,
        exists: !!p,
      };
    });

  // ---- Recent orders ----
  const scopedRecent = hasCustom
    ? orders.filter((o) => inRange(createdAt(o), rangeFrom, rangeTo))
    : orders;
  const recentOrders = [...scopedRecent]
    // The dashboard's "Recent Orders" is an activity feed: a delivery outcome
    // updated today should outrank an order created earlier and left untouched.
    .sort((a, b) => {
      const latest = (order: Order) => Math.max(createdAt(order), ...order.activity.map((entry) => new Date(entry.at).getTime()).filter(Number.isFinite));
      return latest(b) - latest(a);
    })
    .slice(0, 5)
    .map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      customerName: o.customerName,
      amount: expectedCod(o),
      status: o.status,
      createdAt: o.createdAt,
    }));

  return {
    orders: { last30, prev30, trend: pctTrend(last30, prev30), sparkline: ordersSpark, periodLabel, prevLabel },
    customers: {
      total: totalCustomers,
      trend: pctTrend(totalCustomers, before30),
      new30,
      newTrend: pctTrend(new30, newPrev30),
      oneTimeCount,
      repeatCount,
      oneTimePct: totalCustomers ? Math.round((oneTimeCount / totalCustomers) * 100) : 0,
      repeatPct: totalCustomers ? Math.round((repeatCount / totalCustomers) * 100) : 0,
      periodLabel,
    },
    revenue: { last30: revLast30, prev30: revPrev30, trend: pctTrend(revLast30, revPrev30), last7Days: revenueSpark, periodLabel, prevLabel },
    topCategories,
    salesChart,
    salesChartGroup: groupBy,
    topDistricts,
    products: productRows,
    recentOrders,
  };
}

export function timeAgo(iso: string, now: Date = new Date()): string {
  const mins = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
