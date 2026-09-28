"use client";

import { useMemo, useState } from "react";
import { Archive, ArrowLeftRight, Pencil, Plus, Trash2, Undo2 } from "lucide-react";
import { useAccounting } from "@/lib/accounting/store";
import { ACCOUNT_TYPE_LABELS, type Account, type AccountType } from "@/lib/accounting/types";
import { accountBalance } from "@/lib/accounting/utils";
import { taka } from "@/lib/reports/format";
import { useAccess } from "@/lib/settings/access";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Field, GhostButton, Modal, PrimaryButton, SelectInput, Tag, TextInput } from "@/components/settings/ui";
import { KpiGrid, ReportHeader, RuleNote } from "@/components/reports/kpi";
import { EntryModal } from "@/components/accounting/entry-modal";

export default function AccountsPage() {
  const { accounts, entries, hydrated, addAccount, updateAccount, archiveAccount, deleteAccount } = useAccounting();
  const { can } = useAccess();
  const toast = useToast();
  const [editing, setEditing] = useState<Account | "new" | null>(null);
  const [removing, setRemoving] = useState<Account | null>(null);
  const [transfer, setTransfer] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const live = useMemo(() => accounts.filter((a) => !a.archived), [accounts]);
  const archived = useMemo(() => accounts.filter((a) => a.archived), [accounts]);
  const total = useMemo(() => live.reduce((s, a) => s + accountBalance(a, entries), 0), [live, entries]);

  if (!hydrated) return <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading…</p>;

  const canCreate = can("accounting", "create");
  const canEdit = can("accounting", "edit");
  const canDelete = can("accounting", "delete");
  const shown = showArchived ? [...live, ...archived] : live;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <ReportHeader title="Accounts & balances" description="Cash in hand, bKash, bank — see where your money is. Optional: expenses work without accounts." />
        <div className="flex gap-2">
          {canCreate && live.length > 1 && (
            <GhostButton onClick={() => setTransfer(true)}>
              <ArrowLeftRight size={14} /> Transfer
            </GhostButton>
          )}
          {canCreate && (
            <PrimaryButton onClick={() => setEditing("new")}>
              <Plus size={15} /> Add account
            </PrimaryButton>
          )}
        </div>
      </div>

      <KpiGrid columns={3} items={[{ label: "Total across accounts", value: taka(total), tone: total >= 0 ? "brand" : "bad" }, { label: "Accounts", value: String(live.length) }, { label: "Entries recorded", value: String(entries.length) }]} />

      {shown.length === 0 ? (
        <div className="card p-8 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>
          No accounts yet. Add <b>Cash in hand</b>, <b>bKash</b> or a <b>bank account</b> with what it holds today, then pick it when you record expenses.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((a) => {
            const bal = accountBalance(a, entries);
            const used = entries.filter((e) => e.accountId === a.id || e.toAccountId === a.id).length;
            return (
              <div key={a.id} className="card space-y-3 p-4" style={{ opacity: a.archived ? 0.6 : 1 }}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>
                      {a.name} {a.archived && <Tag>Archived</Tag>}
                    </p>
                    <p className="text-[12px]" style={{ color: "var(--text-faint)" }}>{ACCOUNT_TYPE_LABELS[a.type]}</p>
                  </div>
                  <div className="flex gap-1">
                    {canEdit && (
                      <button aria-label={`Edit ${a.name}`} onClick={() => setEditing(a)} className="focus-ring rounded-lg p-1.5" style={{ color: "var(--text-muted)" }}>
                        <Pencil size={14} />
                      </button>
                    )}
                    {canEdit && (
                      <button aria-label={a.archived ? "Restore" : "Archive"} title={a.archived ? "Restore" : "Archive"} onClick={() => archiveAccount(a.id, !a.archived)} className="focus-ring rounded-lg p-1.5" style={{ color: "var(--text-muted)" }}>
                        {a.archived ? <Undo2 size={14} /> : <Archive size={14} />}
                      </button>
                    )}
                    {canDelete && used === 0 && (
                      <button aria-label={`Delete ${a.name}`} onClick={() => setRemoving(a)} className="focus-ring rounded-lg p-1.5" style={{ color: "var(--red)" }}>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-[24px] font-semibold tabular-nums" style={{ color: bal < 0 ? "var(--red)" : "var(--text)" }}>{taka(bal)}</p>
                <p className="text-[11.5px]" style={{ color: "var(--text-faint)" }}>Started with {taka(a.openingBalance)} · {used} entr{used === 1 ? "y" : "ies"}</p>
              </div>
            );
          })}
        </div>
      )}

      {archived.length > 0 && (
        <button onClick={() => setShowArchived((v) => !v)} className="text-[12.5px] underline" style={{ color: "var(--text-muted)" }}>
          {showArchived ? "Hide" : "Show"} {archived.length} archived account{archived.length === 1 ? "" : "s"}
        </button>
      )}

      <RuleNote>
        A balance = the opening balance + money in − money out from the entries you record here. Sales don&apos;t change it by themselves: when the courier settles COD money or you bank the cash takings,
        record it as <b>Sales money received</b> (that moves the balance without counting the sale twice in profit).
      </RuleNote>

      <AccountModal
        target={editing}
        onClose={() => setEditing(null)}
        onSave={(input, id) => {
          const res = id ? updateAccount(id, input) : addAccount(input);
          if (res.ok) toast(id ? "Account updated" : "Account added");
          return res.ok ? null : res.error;
        }}
      />
      <EntryModal open={transfer} onClose={() => setTransfer(false)} defaultKind="transfer" />
      <ConfirmDialog
        open={!!removing}
        title="Delete this account?"
        message={`“${removing?.name}” has no entries, so nothing else changes.`}
        confirmLabel="Delete"
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          const r = deleteAccount(removing!.id);
          setRemoving(null);
          toast(r.ok ? "Account deleted" : r.error, r.ok ? "success" : "error");
        }}
      />
    </div>
  );
}

function AccountModal({ target, onClose, onSave }: { target: Account | "new" | null; onClose: () => void; onSave: (input: { name: string; type: AccountType; openingBalance: number }, id?: string) => string | null }) {
  if (!target) return null;
  return <AccountForm key={target === "new" ? "new" : target.id} target={target} onClose={onClose} onSave={onSave} />;
}

function AccountForm({ target, onClose, onSave }: { target: Account | "new"; onClose: () => void; onSave: (input: { name: string; type: AccountType; openingBalance: number }, id?: string) => string | null }) {
  const existing = target === "new" ? null : target;
  const [name, setName] = useState(existing?.name ?? "");
  const [type, setType] = useState<AccountType>(existing?.type ?? "cash");
  const [opening, setOpening] = useState(existing ? String(existing.openingBalance) : "0");
  const [error, setError] = useState<string | null>(null);

  function save() {
    const err = onSave({ name, type, openingBalance: Number(opening) }, existing?.id);
    if (err) setError(err);
    else onClose();
  }

  return (
    <Modal
      open
      title={existing ? "Edit account" : "Add account"}
      onClose={onClose}
      footer={
        <>
          <GhostButton onClick={onClose}>Cancel</GhostButton>
          <PrimaryButton onClick={save}>Save</PrimaryButton>
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
        <Field label="Name" required>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cash in hand, bKash (personal), City Bank" maxLength={60} autoFocus />
        </Field>
        <Field label="Type">
          <SelectInput value={type} onChange={setType} options={(Object.keys(ACCOUNT_TYPE_LABELS) as AccountType[]).map((t) => ({ value: t, label: ACCOUNT_TYPE_LABELS[t] }))} />
        </Field>
        <Field label="Opening balance (৳)" hint="What it holds on the day you start recording. Can be negative for an overdraft.">
          <TextInput type="number" inputMode="decimal" step="0.01" value={opening} onChange={(e) => setOpening(e.target.value)} />
        </Field>
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
