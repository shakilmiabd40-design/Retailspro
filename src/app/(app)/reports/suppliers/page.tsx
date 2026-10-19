"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePurchaseOrders } from "@/lib/purchase-orders/store";
import { useProducts } from "@/lib/products/store";
import { useReturns } from "@/lib/returns/store";
import { useSuppliers } from "@/lib/suppliers/store";
import { buildPurchases } from "@/lib/reports/purchases";
import { productMeta } from "@/lib/reports/orders";
import { formatDay, inRange, type DateTypeKey } from "@/lib/reports/dates";
import { num, sum, taka, ymd } from "@/lib/reports/format";
import { useReportFilters } from "@/lib/reports/use-filters";
import { FilterBar } from "@/components/reports/filter-bar";
import { DataTable, type Column } from "@/components/reports/data-table";
import { KpiGrid, Panel, ReportHeader, RuleNote } from "@/components/reports/kpi";
import { RankBars } from "@/components/reports/charts";

const DATE_TYPES: DateTypeKey[] = ["grn", "po_created"];

interface SupplierRow {
  id: string;
  name: string;
  poCount: number;
  purchase: number;
  receivedQty: number;
  returnQty: number;
  returnValue: number;
  lastPurchase: Date | null;
}

export default function SupplierReportPage() {
  const state = useReportFilters("grn");
  const f = state.applied;
  const { purchaseOrders, hydrated } = usePurchaseOrders();
  const { products, hydrated: productsReady } = useProducts();
  const { suppliers } = useSuppliers();
  const { returns, hydrated: returnsReady } = useReturns();

  const grnMode = f.dateType === "grn";

  const rows = useMemo<SupplierRow[]>(() => {
    const { summaries } = buildPurchases(purchaseOrders, f, f.dateType, productMeta(products), false);
    const costOf = new Map<string, number>();
    for (const p of products) for (const v of p.variants) costOf.set(v.id, v.cost);
    const poSupplier = new Map(purchaseOrders.map((po) => [po.id, po.supplierId]));

    const map = new Map<string, SupplierRow>();
    for (const s of suppliers) {
      if (f.supplierId !== "all" && s.id !== f.supplierId) continue;
      map.set(s.id, { id: s.id, name: s.name, poCount: 0, purchase: 0, receivedQty: 0, returnQty: 0, returnValue: 0, lastPurchase: null });
    }
    for (const s of summaries) {
      const row = map.get(s.po.supplierId);
      if (!row) continue;
      row.poCount += 1;
      row.purchase += grnMode ? s.receivedInPeriodValue : s.cost;
      row.receivedQty += grnMode ? s.receivedInPeriodQty : s.received;
      if (!row.lastPurchase || s.lastDate > row.lastPurchase) row.lastPurchase = s.lastDate;
    }
    for (const r of returns) {
      if (r.type !== "supplier") continue;
      const when = new Date(r.returnReceivedAt ?? r.createdAt);
      if (!inRange(when, f.from, f.to)) continue;
      const bySupplierId = poSupplier.get(r.referenceId);
      const row = bySupplierId ? map.get(bySupplierId) : [...map.values()].find((x) => x.name === r.partyName);
      if (!row) continue;
      for (const i of r.items) {
        row.returnQty += i.qty;
        row.returnValue += i.qty * (costOf.get(i.variantId) ?? 0);
      }
    }
    return [...map.values()].filter((r) => r.poCount > 0 || r.returnQty > 0).sort((a, b) => b.purchase - a.purchase);
  }, [purchaseOrders, products, suppliers, returns, f, grnMode]);

  if (!hydrated || !productsReady || !returnsReady) return <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading…</p>;

  const columns: Column<SupplierRow>[] = [
    {
      key: "supplier",
      header: "Supplier",
      value: (r) => r.name,
      cell: (r) => (
        <Link href={`/suppliers/${r.id}`} className="focus-ring rounded font-medium hover:underline" style={{ color: "var(--brand)" }}>
          {r.name}
        </Link>
      ),
      total: () => "Total",
    },
    { key: "po", header: "PO Count", align: "right", value: (r) => r.poCount, total: (rs) => num(sum(rs, (r) => r.poCount)) },
    { key: "purchase", header: "Total Purchase", align: "right", value: (r) => r.purchase, cell: (r) => taka(r.purchase), total: (rs) => taka(sum(rs, (r) => r.purchase)) },
    { key: "received", header: "Received Qty", align: "right", value: (r) => r.receivedQty, total: (rs) => num(sum(rs, (r) => r.receivedQty)) },
    { key: "retq", header: "Return Qty", align: "right", value: (r) => r.returnQty, total: (rs) => num(sum(rs, (r) => r.returnQty)) },
    { key: "retv", header: "Total Returns", align: "right", value: (r) => r.returnValue, cell: (r) => taka(r.returnValue), total: (rs) => taka(sum(rs, (r) => r.returnValue)) },
    { key: "last", header: "Last Purchase Date", value: (r) => ymd(r.lastPurchase), cell: (r) => (r.lastPurchase ? formatDay(r.lastPurchase) : "—") },
  ];

  return (
    <div className="space-y-5 pb-10">
      <ReportHeader title="Supplier Report" description="How much you bought from each supplier, and what went back." meta={`${f.from} to ${f.to}`} />
      <FilterBar state={state} dateTypes={DATE_TYPES} supplier />
      <RuleNote>
        {grnMode ? "GRN date: purchase value is the cost of stock received in the period." : "PO created date: purchase value is the total of purchase orders created in the period."} Returns are supplier returns received (or raised) in the period, valued at product cost. Draft and cancelled orders are left out.
      </RuleNote>

      <KpiGrid
        columns={4}
        items={[
          { label: "Total purchase", value: taka(sum(rows, (r) => r.purchase)), tone: "brand" },
          { label: "Received qty", value: num(sum(rows, (r) => r.receivedQty)), tone: "good" },
          { label: "Supplier return qty", value: num(sum(rows, (r) => r.returnQty)), tone: sum(rows, (r) => r.returnQty) ? "warn" : "neutral" },
          { label: "Supplier return value", value: taka(sum(rows, (r) => r.returnValue)) },
        ]}
      />

      <Panel title="Purchase amount by supplier">
        <RankBars rows={rows.filter((r) => r.purchase > 0).slice(0, 8).map((r) => ({ label: r.name, value: Math.round(r.purchase) }))} />
      </Panel>

      <DataTable exportName="supplier-report" title="Suppliers" columns={columns} rows={rows} rowKey={(r) => r.id} />
    </div>
  );
}
