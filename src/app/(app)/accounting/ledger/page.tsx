"use client";

import { LedgerView } from "@/components/accounting/ledger-view";

export default function LedgerPage() {
  return (
    <LedgerView
      kinds={["expense", "income", "receipt", "transfer", "owner_in", "owner_out"]}
      title="All transactions"
      description="Expenses, other income, money received from sales, transfers between accounts and owner money — in one list."
      addLabel="Add entry"
      defaultKind="expense"
    />
  );
}
