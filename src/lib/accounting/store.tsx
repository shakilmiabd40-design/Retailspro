"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useCollection } from "@/lib/persist/hooks";
import { useAccess } from "@/lib/settings/access";
import { useAudit } from "@/lib/settings/audit";
import { useAuth } from "@/lib/auth/context";
import type { Account, AccountType, EntryKind, LedgerEntry } from "./types";
import { ENTRY_KIND_LABELS } from "./types";
import { dueRecurring, parseDay, todayKey, type DueRecurring } from "./utils";
import { taka as money } from "@/lib/reports/format";

type Result = { ok: true } | { ok: false; error: string };
const fail = (error: string): Result => ({ ok: false, error });

export interface EntryInput {
  date: string;
  kind: EntryKind;
  amount: number;
  accountId?: string;
  toAccountId?: string;
  category?: string;
  party?: string;
  reference?: string;
  note?: string;
  repeatMonthly?: boolean;
}

export interface AccountInput {
  name: string;
  type: AccountType;
  openingBalance: number;
}

interface AccountingContextValue {
  accounts: Account[];
  entries: LedgerEntry[];
  hydrated: boolean;
  getEntry: (id: string) => LedgerEntry | undefined;
  addEntry: (input: EntryInput) => Result;
  updateEntry: (id: string, input: EntryInput) => Result;
  deleteEntry: (id: string) => Result;
  /** Records the next month of a repeating expense. */
  recordRecurring: (due: DueRecurring) => Result;
  stopRepeating: (id: string) => Result;
  due: DueRecurring[];
  addAccount: (input: AccountInput) => Result;
  updateAccount: (id: string, input: AccountInput) => Result;
  archiveAccount: (id: string, archived: boolean) => Result;
  deleteAccount: (id: string) => Result;
  /** Everything ever used as a category, for suggestions. */
  usedCategories: (kind: "expense" | "income") => string[];
}

const AccountingContext = createContext<AccountingContextValue | null>(null);

const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

function validate(input: EntryInput, accounts: Account[]): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || Number.isNaN(parseDay(input.date).getTime())) return "Pick a valid date.";
  if (!Number.isFinite(input.amount) || input.amount <= 0) return "Enter an amount greater than 0.";
  if (input.amount > 1_000_000_000) return "That amount is too large.";
  const known = (id?: string) => !id || accounts.some((a) => a.id === id);
  if (!known(input.accountId) || !known(input.toAccountId)) return "That account no longer exists.";
  if (input.kind === "transfer") {
    if (!input.accountId || !input.toAccountId) return "Choose both accounts for a transfer.";
    if (input.accountId === input.toAccountId) return "A transfer needs two different accounts.";
  }
  if ((input.kind === "receipt" || input.kind === "owner_in" || input.kind === "owner_out") && accounts.length > 0 && !input.accountId) return "Choose the account.";
  if ((input.kind === "expense" || input.kind === "income") && !input.category?.trim()) return "Choose or type a category.";
  return null;
}

function clean(input: EntryInput): Omit<LedgerEntry, "id" | "createdAt"> {
  const isTransfer = input.kind === "transfer";
  const hasCategory = input.kind === "expense" || input.kind === "income";
  return {
    date: input.date,
    kind: input.kind,
    amount: Math.round(input.amount * 100) / 100,
    accountId: input.accountId || undefined,
    toAccountId: isTransfer ? input.toAccountId || undefined : undefined,
    category: hasCategory ? input.category?.trim().slice(0, 80) : undefined,
    party: input.party?.trim().slice(0, 120) || undefined,
    reference: input.reference?.trim().slice(0, 120) || undefined,
    note: input.note?.trim().slice(0, 500) || undefined,
    repeatMonthly: input.kind === "expense" && input.repeatMonthly ? true : undefined,
  };
}

export function AccountingProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts, accountsReady] = useCollection<Account>("accounts");
  const [entries, setEntries, entriesReady] = useCollection<LedgerEntry>("ledger");
  const { can } = useAccess();
  const { log } = useAudit();
  const { user } = useAuth();

  const value = useMemo<AccountingContextValue>(() => {
    const need = (action: "create" | "edit" | "delete"): Result | null => (can("accounting", action) ? null : fail(`You don't have permission to ${action} accounting entries.`));
    const describe = (e: Pick<LedgerEntry, "kind" | "amount" | "category">) => `${ENTRY_KIND_LABELS[e.kind]} ${money(e.amount)}${e.category ? ` · ${e.category}` : ""}`;

    return {
      accounts,
      entries,
      hydrated: accountsReady && entriesReady,
      getEntry: (id) => entries.find((e) => e.id === id),
      due: dueRecurring(entries),

      addEntry(input) {
        const denied = need("create");
        if (denied) return denied;
        const err = validate(input, accounts);
        if (err) return fail(err);
        const entry: LedgerEntry = { ...clean(input), id: uid(), createdAt: new Date().toISOString(), createdBy: user.name };
        if (entry.repeatMonthly) entry.seriesId = entry.id;
        setEntries((prev) => [entry, ...prev]);
        log({ module: "Accounting", action: "create", entity: "Ledger entry", summary: `Recorded ${describe(entry)}`, after: { date: entry.date, kind: entry.kind, amount: entry.amount, category: entry.category } });
        return { ok: true };
      },

      updateEntry(id, input) {
        const denied = need("edit");
        if (denied) return denied;
        const err = validate(input, accounts);
        if (err) return fail(err);
        const prev = entries.find((e) => e.id === id);
        if (!prev) return fail("That entry no longer exists.");
        const next: LedgerEntry = { ...prev, ...clean(input), seriesId: prev.seriesId ?? (input.repeatMonthly && input.kind === "expense" ? prev.id : undefined), updatedAt: new Date().toISOString() };
        setEntries((list) => list.map((e) => (e.id === id ? next : e)));
        log({ module: "Accounting", action: "edit", entity: "Ledger entry", summary: `Changed ${describe(prev)} → ${describe(next)}`, before: { date: prev.date, amount: prev.amount, category: prev.category }, after: { date: next.date, amount: next.amount, category: next.category } });
        return { ok: true };
      },

      deleteEntry(id) {
        const denied = need("delete");
        if (denied) return denied;
        const prev = entries.find((e) => e.id === id);
        if (!prev) return fail("That entry no longer exists.");
        setEntries((list) => list.filter((e) => e.id !== id));
        log({ module: "Accounting", action: "delete", entity: "Ledger entry", summary: `Deleted ${describe(prev)} (${prev.date})`, before: { date: prev.date, kind: prev.kind, amount: prev.amount, category: prev.category } });
        return { ok: true };
      },

      recordRecurring({ entry, dueDate }) {
        const denied = need("create");
        if (denied) return denied;
        if (dueDate > todayKey()) return fail("That one isn't due yet.");
        const series = entry.seriesId ?? entry.id;
        const next: LedgerEntry = { ...entry, id: uid(), date: dueDate, seriesId: series, createdAt: new Date().toISOString(), createdBy: user.name, updatedAt: undefined, repeatMonthly: true };
        // The repeat flag moves to the newest entry, so a series is only ever "due" once.
        setEntries((list) => [next, ...list.map((e) => (e.id === entry.id ? { ...e, repeatMonthly: undefined } : e))]);
        log({ module: "Accounting", action: "create", entity: "Ledger entry", summary: `Recorded repeating ${describe(next)} for ${dueDate}` });
        return { ok: true };
      },

      stopRepeating(id) {
        const denied = need("edit");
        if (denied) return denied;
        setEntries((list) => list.map((e) => (e.id === id ? { ...e, repeatMonthly: undefined, updatedAt: new Date().toISOString() } : e)));
        return { ok: true };
      },

      addAccount(input) {
        const denied = need("create");
        if (denied) return denied;
        const name = input.name.trim();
        if (name.length < 2) return fail("Give the account a name.");
        if (accounts.some((a) => !a.archived && a.name.toLowerCase() === name.toLowerCase())) return fail("You already have an account with that name.");
        if (!Number.isFinite(input.openingBalance)) return fail("Opening balance must be a number.");
        const account: Account = { id: uid(), name: name.slice(0, 60), type: input.type, openingBalance: Math.round(input.openingBalance * 100) / 100, createdAt: new Date().toISOString() };
        setAccounts((prev) => [...prev, account]);
        log({ module: "Accounting", action: "create", entity: `Account ${account.name}`, summary: `Added account “${account.name}” with opening balance ${money(account.openingBalance)}` });
        return { ok: true };
      },

      updateAccount(id, input) {
        const denied = need("edit");
        if (denied) return denied;
        const name = input.name.trim();
        if (name.length < 2) return fail("Give the account a name.");
        if (accounts.some((a) => a.id !== id && !a.archived && a.name.toLowerCase() === name.toLowerCase())) return fail("You already have an account with that name.");
        if (!Number.isFinite(input.openingBalance)) return fail("Opening balance must be a number.");
        setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, name: name.slice(0, 60), type: input.type, openingBalance: Math.round(input.openingBalance * 100) / 100 } : a)));
        log({ module: "Accounting", action: "edit", entity: `Account ${name}`, summary: `Updated account “${name}”` });
        return { ok: true };
      },

      archiveAccount(id, archived) {
        const denied = need("edit");
        if (denied) return denied;
        setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, archived: archived || undefined } : a)));
        return { ok: true };
      },

      deleteAccount(id) {
        const denied = need("delete");
        if (denied) return denied;
        if (entries.some((e) => e.accountId === id || e.toAccountId === id)) return fail("This account has entries. Archive it instead.");
        const a = accounts.find((x) => x.id === id);
        setAccounts((prev) => prev.filter((x) => x.id !== id));
        if (a) log({ module: "Accounting", action: "delete", entity: `Account ${a.name}`, summary: `Deleted account “${a.name}”` });
        return { ok: true };
      },

      usedCategories(kind) {
        const counts = new Map<string, number>();
        for (const e of entries) if (e.kind === kind && e.category) counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
        return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
      },
    };
  }, [accounts, entries, accountsReady, entriesReady, can, log, user.name, setAccounts, setEntries]);

  return <AccountingContext.Provider value={value}>{children}</AccountingContext.Provider>;
}

export function useAccounting() {
  const ctx = useContext(AccountingContext);
  if (!ctx) throw new Error("useAccounting must be used within an AccountingProvider");
  return ctx;
}
