"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useGL } from "@/lib/accounting/gl-store";
import { api } from "@/lib/persist/api";
import type { GrniEntry } from "@/lib/accounting/gl-types";
import { useProducts } from "@/lib/products/store";
import { useSuppliers } from "@/lib/suppliers/store";
import { taka } from "@/lib/reports/format";
import { KpiGrid, ReportHeader } from "@/components/reports/kpi";

const ageDays = (date: string) => Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 86400000));

export default function GrniAgingPage() {
  const { hydrated } = useGL();
  const { products } = useProducts();
  const { suppliers } = useSuppliers();
  const [grni, setGrni] = useState<GrniEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let current = true;
    api<{ rows: GrniEntry[] }>("GET", "/api/accounting/grni")
      .then((result) => { if (current) { setGrni(result.rows); setError(""); } })
      .catch((e) => { if (current) setError(e instanceof Error ? e.message : "Could not load GRNI aging."); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, []);
  const rows = useMemo(() => grni.filter((g) => g.status !== "closed" && g.status !== "invoiced").map((g) => {
    const product = products.find((p) => p.id === g.productId);
    const variant = product?.variants.find((v) => v.id === g.variantId);
    return { ...g, outstanding: Math.max(0, g.amount - g.invoicedAmount), age: ageDays(g.receivedAt), supplierName: suppliers.find((s) => s.id === g.supplierId)?.name ?? g.supplierId, itemName: `${product?.name ?? g.productId} · ${variant?.color ?? ""} / ${variant?.size ?? ""}` };
  }).sort((a, b) => b.age - a.age), [grni, products, suppliers]);
  if (!hydrated || loading) return <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading GRNI…</p>;
  const bucket = (min: number, max: number) => rows.filter((r) => r.age >= min && r.age <= max).reduce((s, r) => s + r.outstanding, 0);
  return <div className="space-y-5">
    <ReportHeader title="GRNI aging" description="Goods received but not yet matched to supplier invoices." />
    <nav className="flex flex-wrap gap-2 text-[12px]"><Link className="rounded-lg border px-3 py-1.5" style={{ borderColor: "var(--border)" }} href="/accounting/trial-balance">Trial balance</Link><Link className="rounded-lg border px-3 py-1.5" style={{ borderColor: "var(--border)" }} href="/accounting/inventory">Inventory</Link><Link className="rounded-lg border px-3 py-1.5" style={{ borderColor: "var(--border)" }} href="/accounting/journals">Journals</Link></nav>
    {error && <p role="alert" className="rounded-xl border px-4 py-3 text-[13px]" style={{ borderColor: "var(--red)", color: "var(--red)" }}>{error}</p>}
    <KpiGrid columns={6} items={[{ label: "Current", value: taka(bucket(0, 30)) }, { label: "31–60 days", value: taka(bucket(31, 60)) }, { label: "61–90 days", value: taka(bucket(61, 90)) }, { label: "Over 90 days", value: taka(bucket(91, Number.MAX_SAFE_INTEGER)), tone: bucket(91, Number.MAX_SAFE_INTEGER) ? "warn" : "neutral" }, { label: "Total open GRNI", value: taka(rows.reduce((s, r) => s + r.outstanding, 0)), tone: "brand" }]} />
    <div className="card overflow-x-auto"><table className="w-full min-w-[760px] text-[12.5px]"><thead><tr className="text-left text-[10.5px] uppercase" style={{ color: "var(--text-faint)" }}><th className="px-4 py-3">Received</th><th className="px-4 py-3">PO</th><th className="px-4 py-3">Supplier</th><th className="px-4 py-3">Variant</th><th className="px-4 py-3 text-right">Received qty</th><th className="px-4 py-3 text-right">Invoiced qty</th><th className="px-4 py-3 text-right">Outstanding</th><th className="px-4 py-3 text-right">Age</th></tr></thead><tbody>{rows.map((r) => <tr key={r.id} className="border-t" style={{ borderColor: "var(--border-soft)" }}><td className="px-4 py-2.5">{r.receivedAt}</td><td className="px-4 py-2.5">{r.poNumber}</td><td className="px-4 py-2.5">{r.supplierName}</td><td className="px-4 py-2.5">{r.itemName}</td><td className="px-4 py-2.5 text-right">{r.qtyReceived}</td><td className="px-4 py-2.5 text-right">{r.qtyInvoiced}</td><td className="px-4 py-2.5 text-right font-medium">{taka(r.outstanding)}</td><td className="px-4 py-2.5 text-right">{r.age}d</td></tr>)}</tbody></table>{!rows.length && <p className="p-8 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>No outstanding GRNI entries.</p>}</div>
  </div>;
}
