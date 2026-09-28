"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { useOrders } from "@/lib/orders/store";
import { useSettings } from "@/lib/settings/store";
import { InvoiceView } from "@/components/settings/invoice-view";
import { SelectInput } from "@/components/settings/ui";

export default function OrderInvoicePage() {
  const params = useParams<{ id: string }>();
  const { getOrder, hydrated } = useOrders();
  const { settings } = useSettings();
  const [paper, setPaper] = useState<"a4" | "pos" | null>(null);

  if (!hydrated) return <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading…</p>;
  const order = getOrder(params.id);
  if (!order) {
    return (
      <div className="card flex flex-col items-center gap-3 p-10 text-center">
        <p className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>Order not found</p>
        <Link href="/orders" className="text-[13px] underline" style={{ color: "var(--brand-strong)" }}>Back to Orders</Link>
      </div>
    );
  }
  const size = paper ?? settings.invoice.print.paperSize;

  return (
    <>
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link href={`/orders/${order.id}`} className="focus-ring flex items-center gap-1.5 text-[12.5px] font-medium" style={{ color: "var(--text-muted)" }}>
          <ArrowLeft size={14} />
          Back to order
        </Link>
        <div className="flex items-center gap-2">
          <div className="w-36">
            <SelectInput value={size} onChange={(v) => setPaper(v)} options={[{ value: "a4", label: "A4" }, { value: "pos", label: "POS (80 mm)" }]} aria-label="Paper size" />
          </div>
          <button onClick={() => window.print()} className="focus-ring flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-semibold text-white" style={{ background: "var(--brand)" }}>
            <Printer size={15} />
            Print
          </button>
        </div>
      </div>
      <InvoiceView order={order} company={settings.company} invoice={settings.invoice} paper={size} />
    </>
  );
}
