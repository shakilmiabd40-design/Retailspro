import { requireAuth } from "@/server/auth";
import { canRead, COLLECTION_ACCESS } from "@/server/collections";
import { ApiError, json, route } from "@/server/http";
import { getCashPosition, getFinanceSummaries, type FinanceSummary } from "@/server/reports/profit-loss";

export const dynamic = "force-dynamic";

type FinanceSummaryPayload = {
  cur: FinanceSummary;
  prev: FinanceSummary;
  balance: number;
  accountCount: number;
};

function validDay(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/**
 * The money side of the dashboard.
 *
 * It reads the **posted ledger** — the same source as Accounting → Profit & Loss —
 * so the dashboard and the accounting screens can never show different profit.
 * (It used to read the old `ledger` collection, which the accounting module no
 * longer writes to, so every expense showed as zero.)
 */
export const GET = route(async (req) => {
  const auth = await requireAuth(req, { passive: true });
  if (!canRead(auth.role, COLLECTION_ACCESS.accounts)) throw new ApiError(403, "forbidden", "You do not have access to accounting financial summaries.");
  if (!canRead(auth.role, COLLECTION_ACCESS.journal_entries)) throw new ApiError(403, "forbidden", "You do not have access to accounting financial summaries.");

  const sp = req.nextUrl.searchParams;
  const from = sp.get("from");
  const to = sp.get("to");
  const previousFrom = sp.get("previousFrom");
  const previousTo = sp.get("previousTo");
  if (![from, to, previousFrom, previousTo].every(validDay) || from! > to! || previousFrom! > previousTo!) {
    throw new ApiError(400, "invalid_date_range", "Choose a valid financial date range.");
  }

  const [summaries, cash] = await Promise.all([
    getFinanceSummaries([
      { key: "cur", label: "Current", from: from!, to: to! },
      { key: "prev", label: "Previous", from: previousFrom!, to: previousTo! },
    ]),
    getCashPosition(),
  ]);

  const payload: FinanceSummaryPayload = { cur: summaries[0], prev: summaries[1], balance: cash.balance, accountCount: cash.accountCount };
  return json(payload);
});
