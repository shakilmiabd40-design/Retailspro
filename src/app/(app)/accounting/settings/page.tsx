"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Save } from "lucide-react";
import { useGL } from "@/lib/accounting/gl-store";
import type { AccountingConfig } from "@/lib/accounting/gl-types";
import { useProducts } from "@/lib/products/store";
import { useAccess } from "@/lib/settings/access";
import { useToast } from "@/components/toast";
import { ReportHeader } from "@/components/reports/kpi";
import { SelectInput } from "@/components/settings/ui";

export default function AccountingSettingsPage() {
  const { config, coa, hydrated, updateConfig } = useGL();
  const { products } = useProducts();
  const { can } = useAccess();
  const toast = useToast();
  const [draft, setDraft] = useState<AccountingConfig>(config);
  useEffect(() => setDraft(config), [config]);
  const categories = useMemo(() => [...new Set(products.map((p) => p.category.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [products]);
  const options = useMemo(() => {
    // Posting mappings store account codes, so duplicate codes must appear only once in each select.
    const byCode = new Map<string, (typeof coa)[number]>();
    for (const account of coa) {
      if (account.archived) continue;
      const current = byCode.get(account.code);
      if (!current || (account.isSystem && !current.isSystem)) byCode.set(account.code, account);
    }
    return [...byCode.values()].map((account) => ({ value: account.code, label: `${account.code} · ${account.name}` }));
  }, [coa]);
  if (!hydrated) return <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading accounting settings…</p>;
  const change = (category: string, field: "inventory" | "cogs" | "revenue", code: string) => setDraft((p) => ({ ...p, categoryAccounts: { ...p.categoryAccounts, [category]: { ...p.categoryAccounts[category], [field]: code || undefined } } }));

  return <div className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3"><ReportHeader title="Accounting settings" description="Map each shoe category and posting role to the accounts used by inventory events." />{can("accounting", "edit") && <button onClick={() => { const result = updateConfig(draft); toast(result.ok ? "Accounting mappings saved" : result.error, result.ok ? "success" : "error"); }} className="focus-ring flex items-center gap-2 rounded-xl px-3.5 py-2 text-[12.5px] font-semibold text-white" style={{ background: "var(--brand)" }}><Save size={14} /> Save mappings</button>}</div>
    <nav className="flex flex-wrap gap-2 text-[12px]"><Link className="rounded-lg border px-3 py-1.5" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }} href="/accounting/trial-balance">Trial balance</Link><Link className="rounded-lg border px-3 py-1.5" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }} href="/accounting/inventory">Inventory valuation</Link><Link className="rounded-lg border px-3 py-1.5" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }} href="/accounting/journals">Journal entries</Link></nav>
    <section className="card overflow-x-auto">
      <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-soft)" }}><h2 className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>Posting accounts by product category</h2><p className="mt-1 text-[11.5px]" style={{ color: "var(--text-muted)" }}>Blank mappings use the standard system accounts. Currency is BDT, costing is FIFO, and tax posting is disabled for now.</p></div>
      <table className="w-full min-w-[780px] text-[12px]"><thead><tr className="text-left text-[10.5px] uppercase" style={{ color: "var(--text-faint)" }}><th className="px-4 py-3">Category</th><th className="px-4 py-3">Inventory asset</th><th className="px-4 py-3">COGS</th><th className="px-4 py-3">Sales revenue</th></tr></thead><tbody>
        {categories.map((category) => <tr key={category} className="border-t" style={{ borderColor: "var(--border-soft)" }}><td className="px-4 py-2 font-medium" style={{ color: "var(--text)" }}>{category}</td>{(["inventory", "cogs", "revenue"] as const).map((field) => <td key={field} className="px-4 py-2"><SelectInput value={draft.categoryAccounts[category]?.[field] ?? ""} onChange={(value) => change(category, field, value)} options={[{ value: "", label: `Default (${field === "inventory" ? "1200" : field === "cogs" ? "5010" : "4010"})` }, ...options]} /></td>)}</tr>)}
        {!categories.length && <tr><td colSpan={4} className="px-4 py-6 text-center" style={{ color: "var(--text-muted)" }}>Add product categories to configure category-level posting.</td></tr>}
      </tbody></table>
    </section>
    <section className="card flex flex-wrap items-center justify-between gap-4 p-4"><div><h2 className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>Inventory adjustment account</h2><p className="mt-1 text-[11.5px]" style={{ color: "var(--text-muted)" }}>Used for approved stock count gains and losses.</p></div><div className="w-full max-w-sm"><SelectInput value={draft.adjustmentAccountCode} onChange={(v) => setDraft((p) => ({ ...p, adjustmentAccountCode: v }))} options={options} /></div></section>
  </div>;
}
