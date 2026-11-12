"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, Plus } from "lucide-react";
import { useGL } from "@/lib/accounting/gl-store";
import { useAccess } from "@/lib/settings/access";
import { useToast } from "@/components/toast";
import { taka } from "@/lib/reports/format";
import { DataTable, type Column } from "@/components/reports/data-table";
import { KpiGrid, ReportHeader, RuleNote } from "@/components/reports/kpi";
import { PrimaryButton } from "@/components/settings/ui";
import { PeriodBar, usePeriod } from "@/components/accounting/period-bar";
import { ExpenseModal } from "@/components/accounting/expense-modal";
import { useReportApi } from "@/lib/reports/use-report";
import type { AccountingExpenseRow } from "@/app/api/accounting/expenses/route";

export default function ExpensesPage() {
  const { coa, journals, postJournalEntry } = useGL();
  const { can } = useAccess();
  const toast = useToast();
  const period = usePeriod("this_month");
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");

  // `refresh` changes when a journal entry is added, so the list reloads.
  const { data, loading, error } = useReportApi<{ rows: AccountingExpenseRow[] }>("/api/accounting/expenses", {
    from: period.from,
    to: period.to,
    refresh: String(journals.length),
  });

  const rows = useMemo(() => data?.rows ?? [], [data]);

  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((row) => [row.name, row.narration, row.memo, row.paidFrom].some((v) => v?.toLowerCase().includes(s)));
  }, [rows, q]);

  const posted = visible.filter((row) => row.status === "posted");
  const spent = posted.reduce((sum, row) => sum + row.amount, 0);
  const byCategory = new Map<string, number>();
  for (const row of posted) byCategory.set(row.name, (byCategory.get(row.name) ?? 0) + row.amount);
  const top = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0];
  const drafts = rows.filter((row) => row.status === "draft").length;

  const canCreate = can("accounting", "create");
  const canApprove = can("accounting", "approve");

  const columns: Column<AccountingExpenseRow>[] = [
    { key: "date", header: "Date", value: (row) => row.date },
    { key: "category", header: "Category", value: (row) => row.name },
    { key: "paidFrom", header: "Paid from", value: (row) => row.paidFrom || "—" },
    { key: "note", header: "Note", value: (row) => row.narration, hidden: true },
    { key: "ref", header: "Entry", value: (row) => row.entryNumber, hidden: true },
    {
      key: "status",
      header: "Status",
      value: (row) => row.status,
      cell: (row) => (
        <span
          className="rounded-full px-2 py-0.5 text-[10.5px]"
          style={{
            background: row.status === "posted" ? "var(--green-soft, #dcfce7)" : "var(--surface-2)",
            color: row.status === "posted" ? "var(--green)" : "var(--text-muted)",
          }}
        >
          {row.status}
        </span>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      value: (row) => row.amount,
      cell: (row) => (
        <b className="tabular-nums" style={{ color: row.amount < 0 ? "var(--green)" : "var(--text)" }}>
          {taka(row.amount)}
        </b>
      ),
      total: (list) => <b className="tabular-nums">{taka(list.reduce((sum, row) => sum + row.amount, 0))}</b>,
    },
    {
      key: "actions",
      header: "",
      noExport: true,
      value: () => "",
      cell: (row) =>
        row.status === "draft" && canApprove ? (
          <button
            aria-label="Post entry"
            onClick={() => {
              const result = postJournalEntry(row.entryId);
              toast(result.ok ? "Entry posted" : result.error, result.ok ? "success" : "error");
            }}
            className="rounded-md border p-1.5"
            style={{ borderColor: "var(--border)", color: "var(--green)" }}
          >
            <Check size={13} />
          </button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <ReportHeader title="Expenses" description="Every cost of running the business — rent, salaries, marketing, packaging and more." />
        {canCreate && (
          <PrimaryButton onClick={() => setAdding(true)}>
            <Plus size={15} /> Add expense
          </PrimaryButton>
        )}
      </div>

      <PeriodBar period={period} />

      <RuleNote>
        These are the expenses in the books, so they are the same numbers the Profit &amp; Loss, the
        dashboard and the trial balance use — courier and delivery included. Cost of goods sold is not
        listed here: it is posted from the sales themselves. An entry only counts once it is posted.
      </RuleNote>

      {error && <p role="alert" className="rounded-xl border px-4 py-3 text-[13px]" style={{ borderColor: "var(--red)", color: "var(--red)" }}>{error}</p>}

      <KpiGrid
        columns={3}
        items={[
          { label: "Total spent", value: taka(spent), tone: "warn" as const, sub: `${posted.length} posted entr${posted.length === 1 ? "y" : "ies"}` },
          { label: "Biggest category", value: top ? top[0] : "—", sub: top ? taka(top[1]) : undefined },
          { label: "Waiting to be posted", value: String(drafts), sub: drafts ? "Not counted in the profit yet" : "Nothing pending" },
        ]}
      />

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search category, note…"
          aria-label="Search"
          className="w-56 rounded-xl border px-2.5 py-1.5 text-[12.5px]"
          style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
        />
        <Link href="/accounting/journals" className="rounded-xl border px-3 py-1.5 text-[12.5px]" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
          All journal entries
        </Link>
        <Link href="/accounting/ledger" className="rounded-xl border px-3 py-1.5 text-[12.5px]" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
          Legacy transactions
        </Link>
      </div>

      <DataTable
        exportName="expenses"
        columns={columns}
        rows={visible}
        rowKey={(row) => `${row.entryId}-${row.accountId}`}
        canExport={can("accounting", "export")}
        emptyText={loading ? "Loading expenses…" : "No expenses recorded for these filters."}
      />

      <ExpenseModal open={adding} onClose={() => setAdding(false)} accounts={coa} />
    </div>
  );
}
