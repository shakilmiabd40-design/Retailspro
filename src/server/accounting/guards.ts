import type { AccountingPeriod, ChartOfAccount, JournalEntry } from "@/lib/accounting/gl-types";

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function assertBalancedJournal(raw: unknown, accounts: ChartOfAccount[]): asserts raw is JournalEntry {
  if (!isObject(raw) || !Array.isArray(raw.lines) || !raw.lines.length) throw new Error("A journal needs at least one line.");
  let debit = 0;
  let credit = 0;
  const known = new Set(accounts.map((a) => a.id));
  for (const line of raw.lines) {
    if (!isObject(line) || !known.has(String(line.accountId))) throw new Error("A journal line references an unknown account.");
    const dr = Number(line.debit);
    const cr = Number(line.credit);
    if (!Number.isFinite(dr) || !Number.isFinite(cr) || dr < 0 || cr < 0 || (dr > 0 && cr > 0)) throw new Error("Journal debit and credit amounts must be non-negative, with only one side used per line.");
    debit += dr;
    credit += cr;
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  if (round(debit) === 0 || Math.abs(round(debit) - round(credit)) > 0.01) throw new Error("Journal entry must balance: total debits must equal total credits.");
  if (Math.abs(round(debit) - Number(raw.totalDebit)) > 0.01 || Math.abs(round(credit) - Number(raw.totalCredit)) > 0.01) throw new Error("Journal totals must match its lines.");
}

export function assertJournalMutation(previous: JournalEntry | undefined, next: JournalEntry | null, accounts: ChartOfAccount[], periods: AccountingPeriod[]): void {
  if (previous?.status === "posted") {
    if (!next) throw new Error("Posted journals cannot be deleted. Create a reversal entry instead.");
    if (JSON.stringify(previous) !== JSON.stringify(next)) throw new Error("Posted journals cannot be edited. Create a reversal or adjustment entry instead.");
    return;
  }
  if (!next) return;
  if (next.status === "posted") {
    if (previous) {
      const was = { ...previous, status: undefined, postedAt: undefined, postedBy: undefined };
      const will = { ...next, status: undefined, postedAt: undefined, postedBy: undefined };
      if (JSON.stringify(was) !== JSON.stringify(will)) throw new Error("A draft can only be posted without changing its contents.");
    }
    assertBalancedJournal(next, accounts);
    const period = periods.find((p) => next.date >= p.from && next.date <= p.to);
    if (period?.status === "locked") throw new Error(`Accounting period ${period.from} to ${period.to} is locked.`);
  }
}
