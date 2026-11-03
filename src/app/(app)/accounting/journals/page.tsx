"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, RotateCcw } from "lucide-react";
import { useGL } from "@/lib/accounting/gl-store";
import { useAccess } from "@/lib/settings/access";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ReportHeader } from "@/components/reports/kpi";
import { taka } from "@/lib/reports/format";

export default function JournalEntriesPage() {
  const { journals, hydrated, postJournalEntry, reverseJournalEntry } = useGL();
  const { can } = useAccess();
  const toast = useToast();
  const [expanded, setExpanded] = useState("");
  const [reversing, setReversing] = useState("");
  const rows = useMemo(() => [...journals].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)), [journals]);
  if (!hydrated) return <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading journals…</p>;

  return (
    <div className="space-y-5">
      <ReportHeader title="Journal entries" description="Balanced entries from inventory, sales, receipts, and approved adjustments. Posted entries are immutable." />
      <nav className="flex flex-wrap gap-2 text-[12px]"><Link className="rounded-lg border px-3 py-1.5" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }} href="/accounting/trial-balance">Trial balance</Link><Link className="rounded-lg border px-3 py-1.5" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }} href="/accounting/inventory">Inventory valuation</Link><Link className="rounded-lg border px-3 py-1.5" style={{ borderColor: "var(--brand)", color: "var(--brand)" }} href="/accounting/journals">Journal entries</Link></nav>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[780px] text-[12.5px]"><thead><tr className="text-left text-[10.5px] uppercase" style={{ color: "var(--text-faint)" }}><th className="px-4 py-3">Entry / date</th><th className="px-4 py-3">Narration</th><th className="px-4 py-3">Source</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Debit = Credit</th><th className="px-4 py-3">Actions</th></tr></thead><tbody>
          {rows.map((entry) => <Fragment key={entry.id} entry={entry} expanded={expanded === entry.id} toggle={() => setExpanded(expanded === entry.id ? "" : entry.id)} canApprove={can("accounting", "approve")} onPost={() => { const r = postJournalEntry(entry.id); toast(r.ok ? "Journal posted" : r.error, r.ok ? "success" : "error"); }} onReverse={() => setReversing(entry.id)} />)}
        </tbody></table>
        {!rows.length && <p className="p-8 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>No journal entries yet. Convert retained history to begin the FIFO and double-entry sub-ledgers.</p>}
      </div>
      <ConfirmDialog open={!!reversing} title="Post a reversal entry?" message="The posted original will remain unchanged. A new entry will reverse each debit and credit and point to the original." confirmLabel="Post reversal" onCancel={() => setReversing("")} onConfirm={() => {
        const entry = journals.find((j) => j.id === reversing);
        if (!entry) return;
        const result = reverseJournalEntry(entry.id, new Date().toISOString().slice(0, 10), `Reversal of ${entry.entryNumber}`);
        toast(result.ok ? "Reversal posted" : result.error, result.ok ? "success" : "error");
        setReversing("");
      }} />
    </div>
  );
}

function Fragment({ entry, expanded, toggle, canApprove, onPost, onReverse }: { entry: ReturnType<typeof useGL>["journals"][number]; expanded: boolean; toggle: () => void; canApprove: boolean; onPost: () => void; onReverse: () => void }) {
  return <>
    <tr className="border-t" style={{ borderColor: "var(--border-soft)" }}>
      <td className="px-4 py-2.5"><button onClick={toggle} className="text-left font-medium" style={{ color: "var(--brand)" }}>{entry.entryNumber}</button><span className="mt-0.5 block text-[11px]" style={{ color: "var(--text-faint)" }}>{entry.date}</span></td>
      <td className="px-4 py-2.5" style={{ color: "var(--text)" }}>{entry.narration}</td><td className="px-4 py-2.5 capitalize" style={{ color: "var(--text-muted)" }}>{entry.source.replace(/_/g, " ")}</td>
      <td className="px-4 py-2.5"><span className="rounded-full px-2 py-0.5 text-[10.5px]" style={{ background: entry.status === "posted" ? "var(--green-soft, #dcfce7)" : "var(--surface-2)", color: entry.status === "posted" ? "var(--green)" : "var(--text-muted)" }}>{entry.status}</span></td>
      <td className="px-4 py-2.5 text-right tabular-nums">{taka(entry.totalDebit)}</td>
      <td className="px-4 py-2.5"><div className="flex gap-1.5">{entry.status === "draft" && canApprove && <button onClick={onPost} title="Post journal" className="rounded-md border p-1.5" style={{ borderColor: "var(--border)", color: "var(--green)" }}><Check size={13} /></button>}{entry.status === "posted" && canApprove && <button onClick={onReverse} title="Reverse journal" className="rounded-md border p-1.5" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}><RotateCcw size={13} /></button>}</div></td>
    </tr>
    {expanded && <tr style={{ background: "var(--surface-2)" }}><td colSpan={6} className="px-4 py-3"><div className="space-y-1.5">{entry.lines.map((line) => <div key={line.id} className="grid grid-cols-[1fr_auto_auto] gap-4 text-[11.5px]" style={{ color: "var(--text-muted)" }}><span>{line.accountCode} · {line.accountName}{line.memo ? ` · ${line.memo}` : ""}</span><span>Dr {taka(line.debit)}</span><span>Cr {taka(line.credit)}</span></div>)}</div></td></tr>}
  </>;
}
