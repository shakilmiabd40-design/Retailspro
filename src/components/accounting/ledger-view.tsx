"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, Repeat, Trash2 } from "lucide-react";
import { useAccounting } from "@/lib/accounting/store";
import { ENTRY_KIND_LABELS, type EntryKind, type LedgerEntry } from "@/lib/accounting/types";
import { nextMonthly, parseDay } from "@/lib/accounting/utils";
import { isMoneyIn } from "@/lib/accounting/utils";
import { taka } from "@/lib/reports/format";
import { useAccess } from "@/lib/settings/access";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { GhostButton, PrimaryButton, SelectInput, Tag, TextInput } from "@/components/settings/ui";
import { DataTable, type Column } from "@/components/reports/data-table";
import { KpiGrid, Panel, ReportHeader } from "@/components/reports/kpi";
import { PeriodBar, usePeriod } from "./period-bar";
import { DueBanner } from "./due-banner";
import { EntryModal } from "./entry-modal";

const KIND_TONE: Record<EntryKind, "red" | "green" | "blue" | "muted" | "brand"> = { expense: "red", income: "green", receipt: "blue", transfer: "muted", owner_in: "brand", owner_out: "brand" };

export function LedgerView({ kinds, title, description, addLabel, defaultKind }: { kinds: EntryKind[]; title: string; description: string; addLabel: string; defaultKind: EntryKind }) {
  const { entries, accounts, hydrated, deleteEntry, stopRepeating } = useAccounting();
  const { can } = useAccess();
  const toast = useToast();
  const period = usePeriod("this_month");
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<EntryKind | "all">("all");
  const [category, setCategory] = useState("all");
  const [accountId, setAccountId] = useState("all");
  const [editing, setEditing] = useState<LedgerEntry | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<LedgerEntry | null>(null);

  const accountName = useMemo(() => new Map(accounts.map((a) => [a.id, a.name])), [accounts]);
  const inKinds = useMemo(() => entries.filter((e) => kinds.includes(e.kind)), [entries, kinds]);
  const categories = useMemo(() => [...new Set(inKinds.map((e) => e.category).filter((c): c is string => !!c))].sort(), [inKinds]);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return inKinds
      .filter((e) => e.date >= period.from && e.date <= period.to)
      .filter((e) => kind === "all" || e.kind === kind)
      .filter((e) => category === "all" || e.category === category)
      .filter((e) => accountId === "all" || e.accountId === accountId || e.toAccountId === accountId)
      .filter((e) => !s || [e.category, e.party, e.reference, e.note].some((v) => v?.toLowerCase().includes(s)))
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }, [inKinds, period.from, period.to, kind, category, accountId, q]);

  const repeating = useMemo(() => entries.filter((e) => e.kind === "expense" && e.repeatMonthly), [entries]);

  if (!hydrated) return <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading…</p>;

  const total = (list: LedgerEntry[]) => list.reduce((s, e) => s + e.amount, 0);
  const spent = total(rows.filter((r) => r.kind === "expense"));
  const earned = total(rows.filter((r) => r.kind === "income"));
  const byCat = new Map<string, number>();
  for (const r of rows.filter((x) => x.kind === "expense")) byCat.set(r.category ?? "Uncategorised", (byCat.get(r.category ?? "Uncategorised") ?? 0) + r.amount);
  const top = [...byCat.entries()].sort((a, b) => b[1] - a[1])[0];

  const canEdit = can("accounting", "edit");
  const canDelete = can("accounting", "delete");
  const canCreate = can("accounting", "create");

  const columns: Column<LedgerEntry>[] = [
    { key: "date", header: "Date", value: (e) => e.date, cell: (e) => <span className="whitespace-nowrap">{e.date}</span> },
    { key: "type", header: "Type", value: (e) => ENTRY_KIND_LABELS[e.kind], cell: (e) => <Tag tone={KIND_TONE[e.kind]}>{ENTRY_KIND_LABELS[e.kind]}</Tag> },
    {
      key: "category",
      header: "Category",
      value: (e) => e.category ?? "",
      cell: (e) => (
        <span className="inline-flex items-center gap-1.5">
          {e.category ?? "—"}
          {e.repeatMonthly && (
            <span title="Repeats monthly" style={{ color: "var(--text-faint)" }}>
              <Repeat size={12} />
            </span>
          )}
        </span>
      ),
    },
    { key: "party", header: "Paid to / from", value: (e) => e.party ?? "" },
    {
      key: "account",
      header: "Account",
      value: (e) => (e.kind === "transfer" ? `${accountName.get(e.accountId ?? "") ?? "?"} → ${accountName.get(e.toAccountId ?? "") ?? "?"}` : (accountName.get(e.accountId ?? "") ?? "")),
    },
    { key: "reference", header: "Reference", value: (e) => e.reference ?? "", hidden: true },
    { key: "note", header: "Note", value: (e) => e.note ?? "", hidden: true },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      value: (e) => (isMoneyIn(e.kind) ? e.amount : e.kind === "transfer" ? e.amount : -e.amount),
      cell: (e) => (
        <b className="tabular-nums" style={{ color: e.kind === "transfer" ? "var(--text)" : isMoneyIn(e.kind) ? "var(--green)" : "var(--red)" }}>
          {e.kind === "transfer" ? "" : isMoneyIn(e.kind) ? "+" : "−"}
          {taka(e.amount)}
        </b>
      ),
      total: (list) => {
        const net = list.reduce((s, e) => s + (e.kind === "transfer" ? 0 : isMoneyIn(e.kind) ? e.amount : -e.amount), 0);
        return <b className="tabular-nums">{net < 0 ? "−" : ""}{taka(Math.abs(net))}</b>;
      },
    },
    {
      key: "actions",
      header: "",
      noExport: true,
      value: () => "",
      cell: (e) => (
        <span className="flex justify-end gap-1">
          {canEdit && (
            <button aria-label="Edit" onClick={() => setEditing(e)} className="focus-ring rounded-lg p-1.5" style={{ color: "var(--text-muted)" }}>
              <Pencil size={14} />
            </button>
          )}
          {canDelete && (
            <button aria-label="Delete" onClick={() => setRemoving(e)} className="focus-ring rounded-lg p-1.5" style={{ color: "var(--red)" }}>
              <Trash2 size={14} />
            </button>
          )}
        </span>
      ),
    },
  ];

  const kpis = kinds.includes("expense") && kinds.length === 1
    ? [
        { label: "Total spent", value: taka(spent), tone: "warn" as const, sub: `${rows.length} entr${rows.length === 1 ? "y" : "ies"}` },
        { label: "Biggest category", value: top ? top[0] : "—", sub: top ? taka(top[1]) : undefined },
        { label: "Repeating monthly", value: String(repeating.length), sub: repeating.length ? taka(total(repeating)) + " / month" : "None set up" },
      ]
    : [
        { label: "Spent", value: taka(spent), tone: "warn" as const },
        { label: "Other income", value: taka(earned), tone: "good" as const },
        { label: "Entries", value: String(rows.length) },
      ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <ReportHeader title={title} description={description} />
        {canCreate && (
          <PrimaryButton onClick={() => setAdding(true)}>
            <Plus size={15} /> {addLabel}
          </PrimaryButton>
        )}
      </div>

      <PeriodBar period={period} />
      <DueBanner />
      <KpiGrid columns={3} items={kpis} />

      <div className="flex flex-wrap items-center gap-2">
        <div className="w-56">
          <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search category, name, note…" aria-label="Search" />
        </div>
        {kinds.length > 1 && (
          <div className="w-52">
            <SelectInput value={kind} onChange={setKind} options={[{ value: "all", label: "All types" }, ...kinds.map((k) => ({ value: k, label: ENTRY_KIND_LABELS[k] }))]} aria-label="Type" />
          </div>
        )}
        {categories.length > 0 && (
          <div className="w-56">
            <SelectInput value={category} onChange={setCategory} options={[{ value: "all", label: "All categories" }, ...categories.map((c) => ({ value: c, label: c }))]} aria-label="Category" />
          </div>
        )}
        {accounts.length > 0 && (
          <div className="w-44">
            <SelectInput value={accountId} onChange={setAccountId} options={[{ value: "all", label: "All accounts" }, ...accounts.map((a) => ({ value: a.id, label: a.name }))]} aria-label="Account" />
          </div>
        )}
      </div>

      <DataTable
        exportName={title.toLowerCase().replace(/\W+/g, "-")}
        columns={columns}
        rows={rows}
        rowKey={(e) => e.id}
        canExport={can("accounting", "export")}
        emptyText="Nothing recorded for these filters."
      />

      {kinds.includes("expense") && repeating.length > 0 && (
        <Panel title="Repeating expenses" subtitle="These come back every month — you get a reminder when one is due.">
          <div className="divide-y" style={{ borderColor: "var(--border-soft)" }}>
            {repeating.map((e) => (
              <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[13px]">
                <span style={{ color: "var(--text)" }}>
                  <b>{e.category}</b> · {taka(e.amount)} <span style={{ color: "var(--text-muted)" }}>· next {nextMonthly(e.date, parseDay(e.seriesId ? (entries.find((x) => x.id === e.seriesId)?.date ?? e.date) : e.date).getDate())}</span>
                </span>
                {canEdit && (
                  <GhostButton
                    onClick={() => {
                      stopRepeating(e.id);
                      toast("Won't repeat any more");
                    }}
                  >
                    Stop repeating
                  </GhostButton>
                )}
              </div>
            ))}
          </div>
        </Panel>
      )}

      <EntryModal open={adding} onClose={() => setAdding(false)} defaultKind={defaultKind} />
      <EntryModal open={!!editing} entry={editing ?? undefined} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={!!removing}
        title="Delete this entry?"
        message={removing ? `${ENTRY_KIND_LABELS[removing.kind]} of ${taka(removing.amount)} on ${removing.date}. This changes your profit and balances.` : ""}
        confirmLabel="Delete"
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          const r = removing!;
          setRemoving(null);
          const res = deleteEntry(r.id);
          toast(res.ok ? "Entry deleted" : res.error, res.ok ? "success" : "error");
        }}
      />
    </div>
  );
}
