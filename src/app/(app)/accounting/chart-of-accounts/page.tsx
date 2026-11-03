"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { useGL } from "@/lib/accounting/gl-store";
import type { AccountType, NormalBalance } from "@/lib/accounting/gl-types";
import { ACCOUNT_TYPE_LABELS } from "@/lib/accounting/gl-types";
import { useAccess } from "@/lib/settings/access";
import { useToast } from "@/components/toast";
import { ReportHeader } from "@/components/reports/kpi";

export default function ChartOfAccountsPage() {
  const { coa, hydrated, addChartAccount } = useGL();
  const { can } = useAccess();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("asset");
  const [normalBalance, setNormalBalance] = useState<NormalBalance>("debit");
  const [parentId, setParentId] = useState("");
  const [allowManual, setAllowManual] = useState(false);
  if (!hydrated) return <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading chart of accounts…</p>;
  const rows = [...coa].sort((a, b) => a.code.localeCompare(b.code));
  const reset = () => { setCode(""); setName(""); setType("asset"); setNormalBalance("debit"); setParentId(""); setAllowManual(false); setAdding(false); };
  return <div className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3"><ReportHeader title="Chart of accounts" description="System control accounts and category-level posting accounts for the general ledger." />{can("accounting", "create") && <button onClick={() => setAdding((v) => !v)} className="focus-ring flex items-center gap-2 rounded-xl px-3.5 py-2 text-[12.5px] font-semibold text-white" style={{ background: "var(--brand)" }}><Plus size={14} /> Add account</button>}</div>
    <nav className="flex flex-wrap gap-2 text-[12px]"><Link className="rounded-lg border px-3 py-1.5" style={{ borderColor: "var(--border)" }} href="/accounting/trial-balance">Trial balance</Link><Link className="rounded-lg border px-3 py-1.5" style={{ borderColor: "var(--border)" }} href="/accounting/inventory">Inventory valuation</Link><Link className="rounded-lg border px-3 py-1.5" style={{ borderColor: "var(--border)" }} href="/accounting/journals">Journal entries</Link><Link className="rounded-lg border px-3 py-1.5" style={{ borderColor: "var(--border)" }} href="/accounting/settings">Posting settings</Link></nav>
    {adding && <form className="card grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4" onSubmit={(e) => { e.preventDefault(); const result = addChartAccount({ code, name, type, normalBalance, parentId: parentId || undefined, controlAccount: false, allowManual }); toast(result.ok ? "Account added" : result.error, result.ok ? "success" : "error"); if (result.ok) reset(); }}>
      <label className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>Code<input required value={code} onChange={(e) => setCode(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-[13px]" style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }} /></label>
      <label className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>Name<input required value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-[13px]" style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }} /></label>
      <label className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>Type<select value={type} onChange={(e) => { const v = e.target.value as AccountType; setType(v); setNormalBalance(v === "asset" || v === "expense" ? "debit" : "credit"); }} className="mt-1 w-full rounded-lg border px-3 py-2 text-[13px]" style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}>{Object.entries(ACCOUNT_TYPE_LABELS).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></label>
      <label className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>Normal balance<select value={normalBalance} onChange={(e) => setNormalBalance(e.target.value as NormalBalance)} className="mt-1 w-full rounded-lg border px-3 py-2 text-[13px]" style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}><option value="debit">Debit</option><option value="credit">Credit</option></select></label>
      <label className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>Parent account<select value={parentId} onChange={(e) => setParentId(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-[13px]" style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}><option value="">No parent</option>{rows.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></label>
      <label className="flex items-center gap-2 self-end pb-2 text-[12px]" style={{ color: "var(--text-muted)" }}><input type="checkbox" checked={allowManual} onChange={(e) => setAllowManual(e.target.checked)} /> Allow manual journal lines</label>
      <div className="flex items-end gap-2"><button type="submit" className="rounded-lg px-3 py-2 text-[12px] font-semibold text-white" style={{ background: "var(--brand)" }}>Save account</button><button type="button" onClick={reset} className="rounded-lg border px-3 py-2 text-[12px]" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>Cancel</button></div>
    </form>}
    <div className="card overflow-x-auto"><table className="w-full min-w-[700px] text-[12.5px]"><thead><tr className="text-left text-[10.5px] uppercase" style={{ color: "var(--text-faint)" }}><th className="px-4 py-3">Code</th><th className="px-4 py-3">Account</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Normal balance</th><th className="px-4 py-3">Posting rule</th></tr></thead><tbody>{rows.map((a) => <tr key={a.id} className="border-t" style={{ borderColor: "var(--border-soft)" }}><td className="px-4 py-2.5 tabular-nums">{a.code}</td><td className="px-4 py-2.5 font-medium" style={{ color: "var(--text)" }}>{a.name}</td><td className="px-4 py-2.5">{ACCOUNT_TYPE_LABELS[a.type]}</td><td className="px-4 py-2.5 capitalize">{a.normalBalance}</td><td className="px-4 py-2.5" style={{ color: "var(--text-muted)" }}>{a.controlAccount ? "Control account" : a.allowManual ? "Manual + mapped" : "Mapped only"}</td></tr>)}</tbody></table></div>
  </div>;
}
