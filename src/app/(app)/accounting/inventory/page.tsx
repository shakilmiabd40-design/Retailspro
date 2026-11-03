"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useGL } from "@/lib/accounting/gl-store";
import { useProducts } from "@/lib/products/store";
import { taka } from "@/lib/reports/format";
import { KpiGrid, ReportHeader } from "@/components/reports/kpi";

export default function InventoryAccountingPage() {
  const { layers, movements, hydrated, trialBalance } = useGL();
  const { products, hydrated: productsReady } = useProducts();
  const rows = useMemo(() => {
    const productById = new Map(products.map((p) => [p.id, p]));
    const grouped = new Map<string, { productId: string; variantId: string; qty: number; value: number }>();
    for (const layer of layers) {
      if (layer.remainingQty <= 0) continue;
      const key = `${layer.productId}:${layer.variantId}`;
      const row = grouped.get(key) ?? { productId: layer.productId, variantId: layer.variantId, qty: 0, value: 0 };
      row.qty += layer.remainingQty;
      row.value += layer.remainingQty * layer.unitCost;
      grouped.set(key, row);
    }
    return [...grouped.values()].map((r) => {
      const product = productById.get(r.productId);
      const variant = product?.variants.find((v) => v.id === r.variantId);
      return { ...r, name: product?.name ?? r.productId, sku: variant?.sku ?? "—", size: variant?.size ?? "—", color: variant?.color ?? "—" };
    }).sort((a, b) => a.name.localeCompare(b.name) || a.size.localeCompare(b.size));
  }, [layers, products]);

  if (!hydrated || !productsReady) return <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading FIFO inventory…</p>;
  const stockValue = rows.reduce((s, r) => s + r.value, 0);
  const inventoryAccount = trialBalance().lines.find((r) => r.account.code === "1200");
  const glValue = (inventoryAccount?.debit ?? 0) - (inventoryAccount?.credit ?? 0);
  const difference = stockValue - glValue;
  const recent = [...movements].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).slice(0, 20);

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
