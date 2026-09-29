"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useSuppliers } from "@/lib/suppliers/store";
import { SupplierForm } from "@/components/suppliers/supplier-form";

export default function EditSupplierPage() {
  const params = useParams<{ id: string }>();
  const { getSupplier, hydrated } = useSuppliers();
  const supplier = getSupplier(params.id);

  if (!hydrated) return <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading…</p>;

  if (!supplier) {
    return (
      <div className="card flex flex-col items-center gap-3 p-10 text-center">
        <p className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>
          Supplier not found
        </p>
        <Link href="/suppliers" className="focus-ring mt-1 flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-medium text-white" style={{ background: "var(--brand)" }}>
          <ArrowLeft size={14} />
          Back to Suppliers
        </Link>
      </div>
    );
  }

  return <SupplierForm initial={supplier} />;
}
