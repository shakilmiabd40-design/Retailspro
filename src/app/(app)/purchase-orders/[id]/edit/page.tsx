"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { usePurchaseOrders } from "@/lib/purchase-orders/store";
import { PurchaseOrderForm } from "@/components/purchase-orders/purchase-order-form";

export default function EditPurchaseOrderPage() {
  const params = useParams<{ id: string }>();
  const { getPo, hydrated } = usePurchaseOrders();
  const po = getPo(params.id);

  if (!hydrated) return <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading…</p>;

  if (!po) {
    return (
      <div className="card flex flex-col items-center gap-3 p-10 text-center">
        <p className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>Purchase order not found</p>
        <Link href="/purchase-orders" className="focus-ring mt-1 flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-medium text-white" style={{ background: "var(--brand)" }}>
          <ArrowLeft size={14} />
          Back to Purchase Orders
        </Link>
      </div>
    );
  }

  return <PurchaseOrderForm initial={po} />;
}
