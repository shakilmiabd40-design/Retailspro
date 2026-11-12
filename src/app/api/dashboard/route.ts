import type { DashboardData } from "@/lib/types";
import { buildDashboard, type DashboardDateRange } from "@/lib/dashboard";
import type { Product } from "@/lib/products/types";
import type { PosInvoice } from "@/lib/pos/types";
import type { LedgerEntry } from "@/lib/accounting/types";
import { query } from "@/server/db";
import { json, route, ApiError } from "@/server/http";
import { requireAuth } from "@/server/auth";
import { canRead, COLLECTION_ACCESS } from "@/server/collections";
import { canSeeProductCost, redactProductCost } from "@/server/redact";
import { loadDashboardOrders, loadDashboardProducts } from "@/server/reports/dashboard-source";
import { getLedgerSales } from "@/server/reports/profit-loss";
import { RevisionCache, revisionKey } from "@/server/revision-cache";

export const dynamic = "force-dynamic";

const dashboardCache = new RevisionCache<DashboardData>(24);

function day(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export const GET = route(async (req) => {
  const auth = await requireAuth(req, { passive: true });
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  if (!day(from) || !day(to) || from > to) throw new ApiError(400, "invalid_date_range", "Choose a valid dashboard date range.");

  const canReadInvoices = canRead(auth.role, COLLECTION_ACCESS.pos_invoices);
  const canReadLedger = canRead(auth.role, COLLECTION_ACCESS.ledger);
  const seesCost = canSeeProductCost(auth.role);
  const label = req.nextUrl.searchParams.get("label")?.slice(0, 80) || `${from} to ${to}`;
  const dateRange: DashboardDateRange = { from, to, label };
  const revisions = await revisionKey(["orders", "products", ...(canReadInvoices ? ["pos_invoices"] : []), ...(canReadLedger ? ["ledger"] : [])]);
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const canReadJournal = canRead(auth.role, COLLECTION_ACCESS.journal_entries);
  const cacheKey = JSON.stringify({ revisions, from, to, label, today, canReadInvoices, canReadLedger, canReadJournal, seesCost });
  const data = await dashboardCache.get(cacheKey, async () => {
    const load = async <T,>(collection: string): Promise<T[]> => {
      const { rows } = await query<{ data: T }>("select data from app_records where collection=$1", [collection]);
      return rows.map((row) => row.data);
    };
    const [orders, storedProducts, invoices, ledger, sales] = await Promise.all([
      loadDashboardOrders(),
      loadDashboardProducts(),
      canReadInvoices ? load<PosInvoice>("pos_invoices") : Promise.resolve([]),
      canReadLedger ? load<LedgerEntry>("ledger") : Promise.resolve([]),
      canReadJournal ? getLedgerSales(from, to) : Promise.resolve(undefined),
    ]);
    const products = seesCost ? storedProducts : storedProducts.map((product) => redactProductCost(product) as Product);
    const dashboard = buildDashboard(orders, products, now, ledger, invoices, dateRange);
    // Sales as booked in the ledger — the figure the Accounting screens show.
    return sales === undefined ? dashboard : { ...dashboard, revenue: { ...dashboard.revenue, sales } };
  });
  return json({ data });
});
