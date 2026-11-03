import type { Account, LedgerEntry } from "@/lib/accounting/types";
import { accountBalance, profitLoss, type ProfitLoss } from "@/lib/accounting/utils";
import type { Order } from "@/lib/orders/types";
import type { Product } from "@/lib/products/types";
import type { PosInvoice } from "@/lib/pos/types";
import { canRead, COLLECTION_ACCESS } from "@/server/collections";
import { requireAuth } from "@/server/auth";
import { query } from "@/server/db";
import { ApiError, json, route } from "@/server/http";
import { canSeeProductCost, redactProductCost } from "@/server/redact";
import { RevisionCache, revisionKey } from "@/server/revision-cache";

export const dynamic = "force-dynamic";

type FinanceSummary = { cur: ProfitLoss; prev: ProfitLoss; balance: number; accountCount: number };
const financeCache = new RevisionCache<FinanceSummary>(24);

const validDay = (value: string | null) => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

export const GET = route(async (req) => {
  const auth = await requireAuth(req, { passive: true });
  if (!canRead(auth.role, COLLECTION_ACCESS.accounts) || !canRead(auth.role, COLLECTION_ACCESS.ledger)) throw new ApiError(403, "forbidden", "You do not have access to accounting financial summaries.");
  const sp = req.nextUrl.searchParams;
  const from = sp.get("from");
  const to = sp.get("to");
  const previousFrom = sp.get("previousFrom");
  const previousTo = sp.get("previousTo");
  if (![from, to, previousFrom, previousTo].every(validDay) || from! > to! || previousFrom! > previousTo!) throw new ApiError(400, "invalid_date_range", "Choose a valid financial date range.");

  const canReadInvoices = canRead(auth.role, COLLECTION_ACCESS.pos_invoices);
  const seesCost = canSeeProductCost(auth.role);
  const revisions = await revisionKey(["orders", "products", "ledger", "accounts", ...(canReadInvoices ? ["pos_invoices"] : [])]);
  const key = JSON.stringify({ revisions, from, to, previousFrom, previousTo, canReadInvoices, seesCost });
  const result = await financeCache.get(key, async () => {
    const load = async <T,>(collection: string): Promise<T[]> => {
      const { rows } = await query<{ data: T }>("select data from app_records where collection=$1", [collection]);
      return rows.map((row) => row.data);
    };
    const [orders, storedProducts, invoices, ledger, accounts] = await Promise.all([
      load<Order>("orders"),
      load<Product>("products"),
      canReadInvoices ? load<PosInvoice>("pos_invoices") : Promise.resolve([]),
      load<LedgerEntry>("ledger"),
      load<Account>("accounts"),
    ]);
    const products = seesCost ? storedProducts : storedProducts.map((product) => redactProductCost(product) as Product);
    const input = { orders, products, invoices, ledger };
    const cur = profitLoss(input, from!, to!);
    const prev = profitLoss(input, previousFrom!, previousTo!);
    const liveAccounts = accounts.filter((account) => !account.archived);
    const balance = liveAccounts.reduce((sum, account) => sum + accountBalance(account, ledger), 0);
    return { cur, prev, balance, accountCount: liveAccounts.length };
  });
  return json(result);
});
