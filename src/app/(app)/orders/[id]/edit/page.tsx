"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useOrders } from "@/lib/orders/store";
import { OrderEditForm } from "@/components/orders/order-edit-form";

export default function EditOrderPage() {
  const params = useParams<{ id: string }>();
  const { getOrder, hydrated } = useOrders();
  const order = getOrder(params.id);

  if (!hydrated) return <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading…</p>;

  if (!order) {
    return (
      <div className="card flex flex-col items-center gap-3 p-10 text-center">
        <p className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>
          Order not found
        </p>
        <Link href="/orders" className="focus-ring mt-1 flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-medium text-white" style={{ background: "var(--brand)" }}>
          <ArrowLeft size={14} />
          Back to Orders
        </Link>
      </div>
    );
  }

  // key resets the form state if the user navigates between two different orders' edit pages.
  return <OrderEditForm key={order.id} order={order} />;
}
