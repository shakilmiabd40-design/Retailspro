"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useProducts } from "@/lib/products/store";
import { ProductForm } from "@/components/products/product-form";

export default function EditProductPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { getProduct, hydrated } = useProducts();
  const product = getProduct(params.id);

  if (!hydrated) {
    return <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading…</p>;
  }

  if (!product) {
    return (
      <div className="card flex flex-col items-center gap-3 p-10 text-center">
        <p className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>
          Product not found
        </p>
        <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
          It may have been deleted. Go back to the product list.
        </p>
        <Link
          href="/products"
          className="focus-ring mt-1 flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-medium text-white"
          style={{ background: "var(--brand)" }}
        >
          <ArrowLeft size={14} />
          Back to Products
        </Link>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => router.back()}
        className="focus-ring mb-1 flex items-center gap-1.5 text-[12.5px] font-medium"
        style={{ color: "var(--text-muted)" }}
      >
        <ArrowLeft size={14} />
        Back
      </button>
      <ProductForm initialProduct={product} />
    </>
  );
}
