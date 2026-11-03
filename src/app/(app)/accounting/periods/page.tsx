"use client";

import { useState } from "react";
import Link from "next/link";
import { useGL } from "@/lib/accounting/gl-store";
import { useAccess } from "@/lib/settings/access";
import { useToast } from "@/components/toast";
import { ReportHeader } from "@/components/reports/kpi";

export default function AccountingPeriodsPage() {
  const { periods, hydrated, addPeriod, changePeriodStatus } = useGL();
  const { can } = useAccess();
  const toast = useToast();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  if (!hydrated) return <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading periods…</p>;
  return <div className="space-y-5">
    <ReportHeader title="Accounting periods" description="Close a period after reconciliation, then lock it to block backdated journal posting. Reopening requires an approver." />
    <nav className="flex flex-wrap gap-2 text-[12px]"><Link className="rounded-lg border px-3 py-1.5" style={{ borderColor: "var(--border)" }} href="/accounting/trial-balance">Trial balance</Link><Link className="rounded-lg border px-3 py-1.5" style={{ borderColor: "var(--border)" }} href="/accounting/balance-sheet">Balance sheet</Link><Link className="rounded-lg border px-3 py-1.5" style={{ borderColor: "var(--border)" }} href="/accounting/inventory">Inventory</Link></nav>
    {can("accounting", "create") && <form className="card flex flex-wrap items-end gap-3 p-4" onSubmit={(e) => { e.preventDefault(); const result = addPeriod(from, to); toast(result.ok ? "Accounting period created" : result.error, result.ok ? "success" : "error"); if (result.ok) { setFrom(""); setTo(""); } }}><label className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>From<input required type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 block rounded-lg border px-3 py-2 text-[12px]" style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }} /></label><label className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>To<input required type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 block rounded-lg border px-3 py-2 text-[12px]" style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }} /></label><button className="rounded-lg px-3 py-2 text-[12px] font-semibold text-white" style={{ background: "var(--brand)" }}>Create period</button></form>}
    <div className="card overflow-x-auto"><table className="w-full min-w-[650px] text-[12.5px]"><thead><tr className="text-left text-[10.5px] uppercase" style={{ color: "var(--text-faint)" }}><th className="px-4 py-3">From</th><th className="px-4 py-3">To</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Last action by</th><th className="px-4 py-3">Action</th></tr></thead><tbody>{periods.map((p) => <tr key={p.id} className="border-t" style={{ borderColor: "var(--border-soft)" }}><td className="px-4 py-2.5">{p.from}</td><td className="px-4 py-2.5">{p.to}</td><td className="px-4 py-2.5 capitalize">{p.status}</td><td className="px-4 py-2.5" style={{ color: "var(--text-muted)" }}>{p.lockedBy ?? p.closedBy ?? "—"}</td><td className="px-4 py-2.5"><div className="flex gap-2">{can("accounting", "approve") && p.status === "open" && <button onClick={() => { const r = changePeriodStatus(p.id, "closed"); toast(r.ok ? "Period closed" : r.error, r.ok ? "success" : "error"); }} className="rounded-md border px-2.5 py-1" style={{ borderColor: "var(--border)" }}>Close</button>}{can("accounting", "approve") && p.status !== "locked" && <button onClick={() => { const r = changePeriodStatus(p.id, "locked"); toast(r.ok ? "Period locked" : r.error, r.ok ? "success" : "error"); }} className="rounded-md border px-2.5 py-1" style={{ borderColor: "var(--border)" }}>Lock</button>}{can("accounting", "approve") && p.status === "locked" && <button onClick={() => { const r = changePeriodStatus(p.id, "open"); toast(r.ok ? "Period reopened" : r.error, r.ok ? "success" : "error"); }} className="rounded-md border px-2.5 py-1" style={{ borderColor: "var(--border)", color: "var(--red)" }}>Reopen</button>}</div></td></tr>)}</tbody></table>{!periods.length && <p className="p-8 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>No accounting periods set.</p>}</div>
  </div>;
}
