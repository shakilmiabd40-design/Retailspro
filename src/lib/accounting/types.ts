/**
 * Accounting model.
 *
 * Sales, product cost and courier cost already live in Orders and the POS — accounting adds the rest of the
 * business's money: running costs (rent, salaries, Facebook boosting…), other income, and where the money
 * physically is (cash, bKash, bank). The profit & loss statement pulls everything together.
 */

export type AccountType = "cash" | "mobile" | "bank" | "other";

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  cash: "Cash",
  mobile: "Mobile banking (bKash, Nagad…)",
  bank: "Bank",
  other: "Other",
};

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  /** Money in the account when you started recording. */
  openingBalance: number;
  archived?: boolean;
  createdAt: string;
}

/**
 * What a ledger entry is.
 *  - expense   — money spent to run the business; reduces profit                 (in P&L)
 *  - income    — money earned that isn't a product sale (commission, refund…)   (in P&L)
 *  - receipt   — sales money that reached an account (COD settlement, cash takings). Moves the balance only,
 *                because the sale itself is already counted from Orders / POS.   (not in P&L)
 *  - transfer  — moving money between your own accounts                           (not in P&L)
 *  - owner_in  — the owner puts money into the business                           (not in P&L)
 *  - owner_out — the owner takes money out for personal use                       (not in P&L)
 */
export type EntryKind = "expense" | "income" | "receipt" | "transfer" | "owner_in" | "owner_out";

export const ENTRY_KIND_LABELS: Record<EntryKind, string> = {
  expense: "Expense",
  income: "Other income",
  receipt: "Sales money received",
  transfer: "Transfer",
  owner_in: "Owner put in money",
  owner_out: "Owner took out money",
};

export interface LedgerEntry {
  id: string;
  /** Local day the money moved, YYYY-MM-DD. */
  date: string;
  kind: EntryKind;
  amount: number;
  /** The account the money left (expense, owner_out, transfer) or arrived in (income, receipt, owner_in). */
  accountId?: string;
  /** Transfers only: the account it arrived in. */
  toAccountId?: string;
  /** Expense / income category, e.g. "Marketing — Facebook boosting". */
  category?: string;
  /** Who was paid / who paid, e.g. the landlord or "Meta". */
  party?: string;
  /** Bill, voucher, transaction id… */
  reference?: string;
  note?: string;
  /** Expense repeats every month. Only the newest entry of a series carries this. */
  repeatMonthly?: boolean;
  /** First entry of the series this one belongs to. */
  seriesId?: string;
  createdAt: string;
  createdBy?: string;
  updatedAt?: string;
}
