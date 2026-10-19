"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/lib/accounting/constants";
import { useAccounting } from "@/lib/accounting/store";
import { ENTRY_KIND_LABELS, type EntryKind, type LedgerEntry } from "@/lib/accounting/types";
import { todayKey } from "@/lib/accounting/utils";
import { useToast } from "@/components/toast";
import { Field, GhostButton, Modal, PrimaryButton, SelectInput, TextArea, TextInput } from "@/components/settings/ui";

const KIND_HINT: Record<EntryKind, string> = {
  expense: "Rent, salary, Facebook boosting, packaging… anything spent to run the business. Reduces profit.",
  income: "Money earned that isn't a product sale — commission, a supplier refund, interest. Adds to profit.",
  receipt: "Sales money that reached an account (COD settlement from the courier, cash takings). Only moves the balance — the sale is already counted from Orders and POS.",
  transfer: "Moving your own money between accounts, e.g. bKash → Bank. Doesn't change profit.",
  owner_in: "You put your own money into the business. Doesn't change profit.",
  owner_out: "You took money out for personal use. Doesn't change profit.",
};

const KINDS: EntryKind[] = ["expense", "income", "receipt", "transfer", "owner_in", "owner_out"];

/** Add or edit a ledger entry. Pass `entry` to edit. */
export function EntryModal({ open, onClose, entry, defaultKind = "expense" }: { open: boolean; onClose: () => void; entry?: LedgerEntry; defaultKind?: EntryKind }) {
  // Remount the form whenever it opens or the target changes, so fields always start fresh.
  if (!open) return null;
  return <Form key={entry?.id ?? `new-${defaultKind}`} onClose={onClose} entry={entry} defaultKind={defaultKind} />;
}

function Form({ onClose, entry, defaultKind }: { onClose: () => void; entry?: LedgerEntry; defaultKind: EntryKind }) {
  const { accounts, addEntry, updateEntry, usedCategories } = useAccounting();
  const toast = useToast();
  const live = accounts.filter((a) => !a.archived || a.id === entry?.accountId || a.id === entry?.toAccountId);

  const [kind, setKind] = useState<EntryKind>(entry?.kind ?? defaultKind);
  const [date, setDate] = useState(entry?.date ?? todayKey());
  const [amount, setAmount] = useState(entry ? String(entry.amount) : "");
  const [accountId, setAccountId] = useState(entry?.accountId ?? live[0]?.id ?? "");
  const [toAccountId, setToAccountId] = useState(entry?.toAccountId ?? live[1]?.id ?? "");
  const [category, setCategory] = useState(entry?.category ?? "");
  const [party, setParty] = useState(entry?.party ?? "");
  const [reference, setReference] = useState(entry?.reference ?? "");
  const [note, setNote] = useState(entry?.note ?? "");
  const [repeat, setRepeat] = useState(!!entry?.repeatMonthly);
  const [error, setError] = useState<string | null>(null);

  const suggestions = useMemo(() => {
    if (kind !== "expense" && kind !== "income") return [];
    const base: readonly string[] = kind === "expense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
    return [...new Set([...usedCategories(kind), ...base])];
  }, [kind, usedCategories]);

  const accountOptions = [{ value: "", label: kind === "expense" || kind === "income" ? "Not tracked" : "Choose…" }, ...live.map((a) => ({ value: a.id, label: a.name }))];
  const showAccount = live.length > 0;
  const isTransfer = kind === "transfer";
  const accountLabel = kind === "expense" || kind === "owner_out" ? "Paid from" : isTransfer ? "From account" : "Money went into";

  function save() {
    const input = {
      date,
      kind,
      amount: Number(amount),
      accountId: accountId || undefined,
      toAccountId: isTransfer ? toAccountId || undefined : undefined,
      category,
      party,
      reference,
      note,
      repeatMonthly: kind === "expense" && repeat,
    };
    const res = entry ? updateEntry(entry.id, input) : addEntry(input);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    toast(entry ? "Entry updated" : `${ENTRY_KIND_LABELS[kind]} recorded`);
    onClose();
  }

  return (
    <Modal
      open
      wide
      title={entry ? "Edit entry" : "Add entry"}
      onClose={onClose}
      footer={
        <>
          <GhostButton onClick={onClose}>Cancel</GhostButton>
          <PrimaryButton onClick={save}>{entry ? "Save changes" : "Save"}</PrimaryButton>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div>
          <div className="flex flex-wrap gap-1.5">
            {KINDS.map((k) => (
              <button
                key={k}
                type="button"
                disabled={!!entry && entry.kind !== k && (entry.kind === "transfer" || k === "transfer")}
                onClick={() => {
                  setKind(k);
                  setError(null);
                }}
                className={clsx("focus-ring rounded-full border px-3 py-1.5 text-[12.5px] font-medium disabled:cursor-not-allowed disabled:opacity-40")}
                style={{ borderColor: kind === k ? "var(--brand)" : "var(--border)", background: kind === k ? "var(--brand-soft)" : "var(--surface)", color: kind === k ? "var(--brand-strong)" : "var(--text-muted)" }}
              >
                {ENTRY_KIND_LABELS[k]}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[12px]" style={{ color: "var(--text-faint)" }}>
            {KIND_HINT[kind]}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Date" required>
            <TextInput type="date" value={date} max="2100-12-31" onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Amount (৳)" required>
            <TextInput type="number" inputMode="decimal" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" autoFocus />
          </Field>
        </div>

        {(kind === "expense" || kind === "income") && (
          <Field label="Category" required hint="Pick a suggestion or type your own.">
            <TextInput list="acct-categories" value={category} onChange={(e) => setCategory(e.target.value)} placeholder={kind === "expense" ? "e.g. Marketing — Facebook / Meta boosting" : "e.g. Commission"} maxLength={80} />
            <datalist id="acct-categories">
              {suggestions.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
        )}

        {showAccount && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={accountLabel}>
              <SelectInput value={accountId} onChange={setAccountId} options={accountOptions} />
            </Field>
            {isTransfer && (
              <Field label="To account">
                <SelectInput value={toAccountId} onChange={setToAccountId} options={accountOptions} />
              </Field>
            )}
          </div>
        )}

        {!isTransfer && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={kind === "expense" ? "Paid to" : kind === "income" || kind === "receipt" ? "Received from" : "Person"} hint="Optional">
              <TextInput value={party} onChange={(e) => setParty(e.target.value)} placeholder={kind === "expense" ? "e.g. Landlord, Meta, Pathao" : ""} maxLength={120} />
            </Field>
            <Field label="Reference" hint="Bill / voucher / transaction no. (optional)">
              <TextInput value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} />
            </Field>
          </div>
        )}

        <Field label="Note" hint="Optional">
          <TextArea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        </Field>

        {kind === "expense" && (
          <label className="flex cursor-pointer items-start gap-2 text-[13px]" style={{ color: "var(--text)" }}>
            <input type="checkbox" className="mt-0.5" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
            <span>
              Repeats every month
              <span className="block text-[12px]" style={{ color: "var(--text-faint)" }}>
                Good for rent, salaries, internet. Each month you&apos;ll get a reminder and can record it in one tap.
              </span>
            </span>
          </label>
        )}

        {error && (
          <p className="rounded-lg border px-3 py-2 text-[12.5px]" style={{ borderColor: "var(--red)", color: "var(--red)" }} role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
