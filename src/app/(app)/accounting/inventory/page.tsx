"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useGL } from "@/lib/accounting/gl-store";
import { api } from "@/lib/persist/api";
import type { InventoryMovement } from "@/lib/accounting/gl-types";
import { useProducts } from "@/lib/products/store";
import { taka } from "@/lib/reports/format";
import { KpiGrid, ReportHeader } from "@/components/reports/kpi";

type InventoryReport = { layers: { productId: string; variantId: string; qty: number; value: number }[]; movements: InventoryMovement[]; glValue: number };

export default function InventoryAccountingPage() {
  const { hydrated } = useGL();
  const { products, hydrated: productsReady } = useProducts();
  const [report, setReport] = useState<InventoryReport | null>(null);
  const [reportError, setReportError] = useState("");
  useEffect(() => {
    let current = true;
    const refresh = async () => {
      try {
        const result = await api<InventoryReport>("GET", "/api/accounting/inventory");
        if (current) { setReport(result); setReportError(""); }
      } catch (error) {
        if (current) setReportError(error instanceof Error ? error.message : "Could not load inventory valuation.");
      }
    };
    void refresh();
    const interval = setInterval(() => void refresh(), 30_000);
    return () => { current = false; clearInterval(interval); };
  }, []);
  const rows = useMemo(() => {
    const productById = new Map(products.map((p) => [p.id, p]));
    return (report?.layers ?? []).map((r) => {
      const product = productById.get(r.productId);
      const variant = product?.variants.find((v) => v.id === r.variantId);
      return { ...r, name: product?.name ?? r.productId, sku: variant?.sku ?? "—", size: variant?.size ?? "—", color: variant?.color ?? "—" };
    }).sort((a, b) => a.name.localeCompare(b.name) || a.size.localeCompare(b.size));
  }, [report, products]);

  if (!hydrated || !productsReady || !report) {
    if (reportError) return <p role="alert" className="rounded-xl border px-4 py-3 text-[13px]" style={{ borderColor: "var(--red)", color: "var(--red)" }}>{reportError}</p>;
    return <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading FIFO inventory…</p>;
  }
  const stockValue = rows.reduce((s, r) => s + r.value, 0);
  const glValue = report.glValue;
  const difference = stockValue - glValue;
  const recent = report.movements;

  return (
    <div className="space-y-5">
      <ReportHeader title="Inventory valuation" description="FIFO cost layers by shoe variant, with the inventory control account reconciliation." />
      <nav className="flex flex-wrap gap-2 text-[12px]">
        <Link className="rounded-lg border px-3 py-1.5" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }} href="/accounting/trial-balance">Trial balance</Link>
        <Link className="rounded-lg border px-3 py-1.5" style={{ borderColor: "var(--brand)", color: "var(--brand)" }} href="/accounting/inventory">Inventory valuation</Link>
        <Link className="rounded-lg border px-3 py-1.5" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }} href="/accounting/journals">Journal entries</Link>
      </nav>
      <KpiGrid columns={3} items={[
        { label: "FIFO sub-ledger value", value: taka(stockValue), tone: "brand", sub: `${rows.reduce((s, r) => s + r.qty, 0)} units` },
        { label: "GL inventory control", value: taka(glValue), sub: "Account 1200" },
        { label: "Reconciliation difference", value: taka(difference), tone: Math.abs(difference) < 0.01 ? "good" : "bad", sub: "Sub-ledger less GL" },
      ]} />
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[700px] text-[12.5px]"><thead><tr className="text-left text-[11px] uppercase" style={{ color: "var(--text-faint)" }}><th className="px-4 py-3">Product / SKU</th><th className="px-4 py-3">Variant</th><th className="px-4 py-3 text-right">On hand</th><th className="px-4 py-3 text-right">FIFO unit cost</th><th className="px-4 py-3 text-right">Valuation</th></tr></thead><tbody>
          {rows.map((r) => <tr key={`${r.productId}:${r.variantId}`} className="border-t" style={{ borderColor: "var(--border-soft)" }}><td className="px-4 py-2.5"><span className="block font-medium" style={{ color: "var(--text)" }}>{r.name}</span><span className="text-[11px]" style={{ color: "var(--text-faint)" }}>{r.sku}</span></td><td className="px-4 py-2.5" style={{ color: "var(--text-muted)" }}>{r.color} / {r.size}</td><td className="px-4 py-2.5 text-right tabular-nums">{r.qty}</td><td className="px-4 py-2.5 text-right tabular-nums">{taka(r.qty ? r.value / r.qty : 0)}</td><td className="px-4 py-2.5 text-right font-medium tabular-nums">{taka(r.value)}</td></tr>)}
        </tbody></table>
        {!rows.length && <p className="p-8 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>No FIFO layers yet. Convert historical data to initialize the sub-ledger.</p>}
      </div>
      <section className="card overflow-x-auto">
        <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-soft)" }}><h2 className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>Recent stock movements</h2></div>
        <table className="w-full min-w-[620px] text-[12px]"><thead><tr className="text-left text-[10.5px] uppercase" style={{ color: "var(--text-faint)" }}><th className="px-4 py-2.5">Date</th><th className="px-4 py-2.5">Type / reference</th><th className="px-4 py-2.5">Variant</th><th className="px-4 py-2.5 text-right">Qty</th><th className="px-4 py-2.5 text-right">Cost</th></tr></thead><tbody>
          {recent.map((m) => { const p = products.find((x) => x.id === m.productId); const v = p?.variants.find((x) => x.id === m.variantId); return <tr key={m.id} className="border-t" style={{ borderColor: "var(--border-soft)" }}><td className="px-4 py-2">{m.date}</td><td className="px-4 py-2 capitalize">{m.type.replace(/_/g, " ")}{m.referenceId ? ` · ${m.referenceId}` : ""}</td><td className="px-4 py-2">{p?.name ?? m.productId} · {v?.color ?? ""} / {v?.size ?? ""}</td><td className="px-4 py-2 text-right">{m.qty}</td><td className="px-4 py-2 text-right">{taka(m.totalCost)}</td></tr>; })}
        </tbody></table>
        {!recent.length && <p className="px-4 py-5 text-[12px]" style={{ color: "var(--text-muted)" }}>No movements recorded.</p>}
      </section>
    </div>
  );
}
