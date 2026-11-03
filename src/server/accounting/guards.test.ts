// Run with: npx tsx --test --conditions=react-server src/server/accounting/guards.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import type { ChartOfAccount, JournalEntry } from "@/lib/accounting/gl-types";
import { assertBalancedJournal, assertJournalMutation } from "./guards";

const accounts: ChartOfAccount[] = [
  { id: "cash", code: "1010", name: "Cash", type: "asset", normalBalance: "debit", controlAccount: false, allowManual: true, isSystem: true, createdAt: "2026-01-01" },
  { id: "sales", code: "4010", name: "Sales", type: "revenue", normalBalance: "credit", controlAccount: false, allowManual: true, isSystem: true, createdAt: "2026-01-01" },
];

const entry: JournalEntry = {
  id: "je-1", entryNumber: "JE-1", date: "2026-05-01", narration: "Sale", source: "manual", status: "posted",
  lines: [
    { id: "l1", accountId: "cash", debit: 100, credit: 0 },
    { id: "l2", accountId: "sales", debit: 0, credit: 100 },
  ], totalDebit: 100, totalCredit: 100, createdAt: "2026-05-01", postedAt: "2026-05-01",
};

test("balanced journal passes and imbalance is rejected", () => {
  assert.doesNotThrow(() => assertBalancedJournal(entry, accounts));
  assert.throws(() => assertBalancedJournal({ ...entry, totalCredit: 90 }, accounts), /balance|totals/i);
});

test("posted entries cannot be edited or deleted", () => {
  assert.throws(() => assertJournalMutation(entry, null, accounts, []), /cannot be deleted/i);
  assert.throws(() => assertJournalMutation(entry, { ...entry, narration: "Changed" }, accounts, []), /cannot be edited/i);
  assert.doesNotThrow(() => assertJournalMutation(entry, entry, accounts, []));
});

test("posting is blocked inside a locked accounting period", () => {
  const draft = { ...entry, status: "draft" as const, postedAt: undefined };
  const posted = { ...draft, status: "posted" as const, postedAt: "2026-05-02" };
  assert.throws(() => assertJournalMutation(draft, posted, accounts, [{ id: "p", from: "2026-05-01", to: "2026-05-31", status: "locked" }]), /locked/i);
});
