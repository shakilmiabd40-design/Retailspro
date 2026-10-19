import type { Order } from "@/lib/orders/types";
import { actualCourierCost, courierLoss, grossRevenue, productSales } from "@/lib/orders/utils";
import type { Product } from "@/lib/products/types";
import type { PosInvoice } from "@/lib/pos/types";
import type { Account, EntryKind, LedgerEntry } from "./types";

// ---- dates (local days as YYYY-MM-DD) ---------------------------------------------------------

export const dayKey = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const todayKey = (): string => dayKey(new Date());
export const monthKey = (day: string): string => day.slice(0, 7);

export function parseDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

const inDays = (iso: string | undefined | null, from: string, to: string): boolean => {
  if (!iso) return false;
  const k = iso.length === 10 ? iso : dayKey(new Date(iso));
  return k >= from && k <= to;
};

export type PeriodKey = "this_month" | "last_month" | "last30" | "this_year" | "custom";
export const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "this_month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "last30", label: "Last 30 days" },
  { key: "this_year", label: "This year" },
  { key: "custom", label: "Custom" },
];

export function periodRange(key: Exclude<PeriodKey, "custom">, now: Date = new Date()): { from: string; to: string } {
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (key) {
    case "this_month":
      return { from: dayKey(new Date(y, m, 1)), to: dayKey(now) };
    case "last_month":
      return { from: dayKey(new Date(y, m - 1, 1)), to: dayKey(new Date(y, m, 0)) };
    case "last30":
      return { from: dayKey(new Date(y, m, now.getDate() - 29)), to: dayKey(now) };
    case "this_year":
      return { from: dayKey(new Date(y, 0, 1)), to: dayKey(now) };
  }
}

/** Last `n` calendar months as { key: "2026-09", from, to, label }, oldest first. */
export function lastMonths(n: number, now: Date = new Date()) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (n - 1 - i), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return { key: dayKey(d).slice(0, 7), from: dayKey(d), to: dayKey(end), label: d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }) };
  });
}

// ---- accounts -----------------------------------------------------------------------------------

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Signed effect of an entry on one account (0 when it doesn't touch it). */
export function effectOn(e: LedgerEntry, accountId: string): number {
  switch (e.kind) {
    case "income":
    case "receipt":
    case "owner_in":
      return e.accountId === accountId ? e.amount : 0;
    case "expense":
    case "owner_out":
      return e.accountId === accountId ? -e.amount : 0;
    case "transfer":
      return (e.toAccountId === accountId ? e.amount : 0) - (e.accountId === accountId ? e.amount : 0);
  }
}

export function accountBalance(a: Account, entries: LedgerEntry[]): number {
  return round2(entries.reduce((s, e) => s + effectOn(e, a.id), a.openingBalance));
}

// ---- recurring expenses -------------------------------------------------------------------------

/** Same day next month, clamped (31 Jan → 28/29 Feb). `anchorDay` keeps a "31st" series on the 31st when it can. */
export function nextMonthly(day: string, anchorDay?: number): string {
  const d = parseDay(day);
  const want = anchorDay ?? d.getDate();
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const last = new Date(y, m + 1, 0).getDate();
  return dayKey(new Date(y, m, Math.min(want, last)));
}

export interface DueRecurring {
  entry: LedgerEntry;
  dueDate: string;
}

/** Monthly expenses whose next month has arrived and hasn't been recorded yet. */
export function dueRecurring(entries: LedgerEntry[], today: string = todayKey()): DueRecurring[] {
  return entries
    .filter((e) => e.kind === "expense" && e.repeatMonthly)
    .map((e) => {
      const first = e.seriesId ? entries.find((x) => x.id === e.seriesId) : undefined;
      return { entry: e, dueDate: nextMonthly(e.date, parseDay(first?.date ?? e.date).getDate()) };
    })
    .filter((d) => d.dueDate <= today)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

// ---- profit & loss ------------------------------------------------------------------------------

export interface ProfitLoss {
  from: string;
  to: string;
  /** Delivered online orders: product sales after discounts. */
  orderSales: number;
  /** Delivery charges billed to customers on delivered orders. */
  deliveryBilled: number;
  /** POS walk-in sales, net of returns. */
  posSales: number;
  /** Sales + delivery billed + POS. */
  revenue: number;
  /** Product cost of everything sold. */
  cogs: number;
  grossProfit: number;
  /** Courier delivery + return + other cost on delivered orders. */
  courierCost: number;
  /** Courier money lost on refused / partly delivered parcels. */
  courierLoss: number;
  /** Other income (commission, refunds…). */
  otherIncome: number;
  /** Expenses by category, biggest first. */
  expensesByCategory: { category: string; amount: number }[];
  operatingExpenses: number;
  /** grossProfit − courier − expenses + other income. */
  netProfit: number;
  /** Net profit as % of revenue (0 when there is no revenue). */
  margin: number;
}

interface PnlInput {
  orders: Order[];
  products: Product[];
  invoices: PosInvoice[];
  ledger: LedgerEntry[];
}

const orderDay = (o: Order) => o.delivery.deliveryDate ?? o.createdAt;

/**
 * Profit & loss for a period. Dates follow the dashboard: an online order counts on its delivery date, a POS sale
 * on the day it was rung up, an expense on the day it was paid.
 * POS "delivery" sales are skipped here — they already exist as Orders and are counted there.
 */
export function profitLoss({ orders, products, invoices, ledger }: PnlInput, from: string, to: string): ProfitLoss {
  const costOf = new Map<string, number>();
  for (const p of products) for (const v of p.variants) costOf.set(v.id, v.cost ?? p.costPrice ?? 0);
  const fallbackCost = new Map(products.map((p) => [p.id, p.costPrice ?? 0]));

  let orderSales = 0;
  let deliveryBilled = 0;
  let cogs = 0;
  let courierCost = 0;
  let lost = 0;
  for (const o of orders) {
    if (o.status === "delivered" && inDays(orderDay(o), from, to)) {
      orderSales += productSales(o);
      deliveryBilled += grossRevenue(o) - productSales(o);
      courierCost += actualCourierCost(o);
      cogs += o.items.reduce((s, i) => s + (costOf.get(i.variantId) ?? fallbackCost.get(i.productId) ?? 0) * i.qty, 0);
    } else if ((o.status === "refuse_return" || o.status === "partial_delivered") && inDays(orderDay(o), from, to)) {
      lost += courierLoss(o);
    }
  }

  let posSales = 0;
  for (const inv of invoices) {
    if (inv.status === "void" || inv.saleType === "delivery" || !inDays(inv.createdAt, from, to)) continue;
    for (const it of inv.items) {
      const kept = Math.max(0, it.qty - (it.returnedQty ?? 0));
      posSales += it.qty > 0 ? (it.net * kept) / it.qty : 0;
      cogs += it.cost * kept;
    }
  }

  let otherIncome = 0;
  const byCat = new Map<string, number>();
  for (const e of ledger) {
    if (e.date < from || e.date > to) continue;
    if (e.kind === "income") otherIncome += e.amount;
    if (e.kind === "expense") byCat.set(e.category?.trim() || "Uncategorised", (byCat.get(e.category?.trim() || "Uncategorised") ?? 0) + e.amount);
  }
  const expensesByCategory = [...byCat.entries()].map(([category, amount]) => ({ category, amount: round2(amount) })).sort((a, b) => b.amount - a.amount);
  const operatingExpenses = round2(expensesByCategory.reduce((s, c) => s + c.amount, 0));

  const revenue = round2(orderSales + deliveryBilled + posSales);
  const grossProfit = round2(revenue - cogs);
  const netProfit = round2(grossProfit - courierCost - lost - operatingExpenses + otherIncome);
  return {
    from,
    to,
    orderSales: round2(orderSales),
    deliveryBilled: round2(deliveryBilled),
    posSales: round2(posSales),
    revenue,
    cogs: round2(cogs),
    grossProfit,
    courierCost: round2(courierCost),
    courierLoss: round2(lost),
    otherIncome: round2(otherIncome),
    expensesByCategory,
    operatingExpenses,
    netProfit,
    margin: revenue > 0 ? Math.round((netProfit / revenue) * 1000) / 10 : 0,
  };
}

export const isMoneyIn = (k: EntryKind) => k === "income" || k === "receipt" || k === "owner_in";
