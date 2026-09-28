"use client";

import { LedgerView } from "@/components/accounting/ledger-view";

export default function ExpensesPage() {
  return <LedgerView kinds={["expense"]} title="Expenses" description="Every cost of running the business — rent, salaries, Facebook boosting, packaging and more." addLabel="Add expense" defaultKind="expense" />;
}
