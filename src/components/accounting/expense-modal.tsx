"use client";

import { useMemo, useState } from "react";
import type { ChartOfAccount } from "@/lib/accounting/gl-types";
import { useGL } from "@/lib/accounting/gl-store";
import { useAccess } from "@/lib/settings/access";
import { useToast } from "@/components/toast";
import { todayKey } from "@/lib/accounting/utils";
import { GhostButton, PrimaryButton, TextInput } from "@/components/settings/ui";

/** Accounts the money can be paid from. */
const CASH_CODES = ["1010", "1020", "1030", "1100"];

/**
 * Records an expense as a journal entry: the expense account is debited and cash
 * (or a receivable) is credited. That is what puts it into the profit figures.
 */
export function ExpenseModal({ open, onClose, accounts }: { open: boolean; onClose: () => void; accounts: ChartOfAccount[] }) {
  const { addJournalEntry } = useGL();
  const { can } = useAccess();
  const toast = useToast();
  const [date, setDate] = useState(() => todayKey());
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [party, setParty] = useState("");
  const [note, setNote] = useState("");
  const [creditId, setCreditId] = useState("");

  const expenseAccounts = useMemo(
    () =>
      accounts
        .filter((a) => a.type === "expense" && !a.code.startsWith("5") && !a.archived && a.allowManual)
        // The specific accounts first (Rent, Salaries, Marketing…), the control account last.
        .sort((a, b) => Number(Boolean(a.controlAccount)) - Number(Boolean(b.controlAccount)) || a.code.localeCompare(b.code)),
    [accounts],
  );
  const creditAccounts = useMemo(
    () => accounts.filter((a) => CASH_CODES.includes(a.code) && !a.archived),
    [accounts],
  );

  if (!open) return null;

  const submit = () => {
    const value = Number(amount);
    if (!accountId) return toast("Choose a category.", "error");
    if (!(value > 0)) return toast("Enter the amount.", "error");
    const credit = creditId || creditAccounts[0]?.id;
    if (!credit) return toast("No cash or bank account is set up yet.", "error");

    const result = addJournalEntry(
      {
        date,
        narration: note.trim() || `${accounts.find((a) => a.id === accountId)?.name ?? "Expense"}${party.trim() ? ` · ${party.trim()}` : ""}`,
        source: "manual",
        lines: [
          { accountId, debit: value, credit: 0, memo: party.trim() || undefined },
          { accountId: credit, debit: 0, credit: value, memo: party.trim() || undefined },
        ],
      },
      can("accounting", "approve"),
    );
    if (!result.ok) return toast(result.error, "error");
    toast(can("accounting", "approve") ? "Expense posted" : "Expense saved as a draft", "success");
    setAmount("");
    setParty("");
    setNote("");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(15,23,42,0.45)" }}>
      <div className="card w-full max-w-md space-y-3 p-5" role="dialog" aria-label="Add expense">
        <h2 className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>Add an expense</h2>

        <label className="block">
          <span className="mb-1 block text-[11.5px] font-medium" style={{ color: "var(--text-muted)" }}>Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="focus-ring w-full rounded-xl border px-3 py-2 text-[13px]" style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }} />
        </label>

        <label className="block">
          <span className="mb-1 block text-[11.5px] font-medium" style={{ color: "var(--text-muted)" }}>Category</span>
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="focus-ring w-full rounded-xl border px-3 py-2 text-[13px]" style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}>
            <option value="">Choose a category…</option>
            {expenseAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-[11.5px] font-medium" style={{ color: "var(--text-muted)" }}>Amount</span>
          <input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" className="focus-ring w-full rounded-xl border px-3 py-2 text-[13px]" style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }} />
        </label>

        <label className="block">
          <span className="mb-1 block text-[11.5px] font-medium" style={{ color: "var(--text-muted)" }}>Paid to</span>
          <TextInput value={party} onChange={(e) => setParty(e.target.value)} placeholder="e.g. Land lord, Facebook" />
        </label>

        <label className="block">
          <span className="mb-1 block text-[11.5px] font-medium" style={{ color: "var(--text-muted)" }}>Paid from</span>
          <select value={creditId} onChange={(e) => setCreditId(e.target.value)} className="focus-ring w-full rounded-xl border px-3 py-2 text-[13px]" style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}>
            {creditAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-[11.5px] font-medium" style={{ color: "var(--text-muted)" }}>Note</span>
          <TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
        </label>

        {!can("accounting", "approve") && (
          <p className="text-[11.5px]" style={{ color: "var(--text-faint)" }}>
            You can save this as a draft; someone with approval rights posts it, and only then does it count toward profit.
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <GhostButton onClick={onClose}>Cancel</GhostButton>
          <PrimaryButton onClick={submit}>Save expense</PrimaryButton>
        </div>
      </div>
    </div>
  );
}
