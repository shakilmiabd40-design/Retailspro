"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Search, Trash2 } from "lucide-react";
import { useProducts } from "@/lib/products/store";
import { useSuppliers } from "@/lib/suppliers/store";
import { usePurchaseOrders } from "@/lib/purchase-orders/store";
import { useSettings } from "@/lib/settings/store";
import { useReturns } from "@/lib/returns/store";
import { useToast } from "@/components/toast";
import type { ItemCondition, ReturnItem } from "@/lib/returns/types";

const inputStyle = { borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" };
const inputClass = "focus-ring w-full rounded-xl border px-3 py-2 text-[13px]";

export default function CreateSupplierReturnPage() {
  const { products } = useProducts();
  const { suppliers } = useSuppliers();
  const { purchaseOrders } = usePurchaseOrders();
  const { settings } = useSettings();
  const poRequired = settings.returns.supplierRequirePoRef;
  const { createSupplierReturn } = useReturns();
  const showToast = useToast();
  const router = useRouter();

  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [poId, setPoId] = useState("");
  const [transportCost, setTransportCost] = useState(0);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<ReturnItem[]>([]);

  const [productQuery, setProductQuery] = useState("");
  const [pickerProductId, setPickerProductId] = useState<string | null>(null);
  const [qtyDraft, setQtyDraft] = useState<Record<string, number>>({});

  const supplier = suppliers.find((s) => s.id === supplierId);
  const supplierPos = purchaseOrders.filter((po) => po.supplierId === supplierId && po.receivings.length > 0);

  const productResults = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    if (!q) return [];
    return products.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)).slice(0, 6);
  }, [productQuery, products]);

  const pickerProduct = products.find((p) => p.id === pickerProductId);

  function handlePoSelect(value: string) {
    if (!value) {
      setPoId("");
      setItems([]);
      return;
    }
    loadFromPo(value);
  }

  function loadFromPo(id: string) {
    setPoId(id);
    const po = purchaseOrders.find((p) => p.id === id);
    if (!po) return;
    setItems(
      po.items
        .filter((i) => i.qtyReceived > 0)
        .map((i) => ({
          id: crypto.randomUUID(),
          productId: i.productId,
          productName: i.productName,
          variantId: i.variantId,
          color: i.color,
          size: i.size,
          sku: i.sku,
          qty: 1,
          reason: "",
          condition: "damaged",
        }))
    );
  }

  function addItem(variantId: string) {
    const product = pickerProduct;
    const variant = product?.variants.find((v) => v.id === variantId);
    if (!product || !variant) return;
    const qty = qtyDraft[variantId] || 1;
    setItems((prev) => [
      ...prev,
      { id: crypto.randomUUID(), productId: product.id, productName: product.name, variantId: variant.id, color: variant.color, size: variant.size, sku: variant.sku, qty, reason: "", condition: "damaged" },
    ]);
  }

  function updateItem(id: string, patch: Partial<ReturnItem>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  function submit() {
    if (!supplier) {
      showToast("Select a supplier", "error");
      return;
    }
    if (poRequired && !poId) {
      showToast("Choose the purchase order this return belongs to", "error");
      return;
    }
    if (!items.length) {
      showToast("Add at least one item to return", "error");
      return;
    }
    const po = purchaseOrders.find((p) => p.id === poId);
    const record = createSupplierReturn({
      supplierId: supplier.id,
      supplierName: supplier.name,
      poId: po?.id,
      poLabel: po?.poNumber,
      transportCost,
      notes,
      items: items.map(({ id: _id, ...rest }) => rest),
    });
    showToast(`Return #${record.returnNumber} created`);
    router.push(`/returns/${record.id}`);
  }

  return (
    <div className="space-y-5 pb-10">
      <Link href="/returns" className="focus-ring flex items-center gap-1.5 text-[12.5px] font-medium" style={{ color: "var(--text-muted)" }}>
        <ArrowLeft size={14} />
        Back to Returns
      </Link>

      <div className="flex items-center justify-between">
        <h1 className="text-[20px] font-semibold" style={{ color: "var(--text)" }}>
          Create Supplier Return
        </h1>
        <button onClick={submit} className="focus-ring rounded-xl px-4 py-2 text-[13px] font-semibold text-white" style={{ background: "var(--brand)" }}>
          Save Return
        </button>
      </div>

      <section className="card space-y-4 p-5">
        <p className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>Reference</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[12.5px] font-medium" style={{ color: "var(--text-muted)" }}>Supplier *</span>
            <select value={supplierId} onChange={(e) => { setSupplierId(e.target.value); setPoId(""); setItems([]); }} className={inputClass} style={inputStyle}>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12.5px] font-medium" style={{ color: "var(--text-muted)" }}>Purchase Order{poRequired ? " (required)" : " — optional"}</span>
            <select value={poId} onChange={(e) => handlePoSelect(e.target.value)} className={inputClass} style={inputStyle}>
              <option value="">{poRequired ? "Select a PO…" : "No specific PO"}</option>
              {supplierPos.map((po) => (
                <option key={po.id} value={po.id}>#{po.poNumber}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <datalist id="supplier-return-reasons">
        {settings.returns.supplierReasons.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>

      <section className="card space-y-4 p-5">
        <p className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>Return Items</p>
        <div className="relative">
          <label className="flex items-center gap-2 rounded-xl border px-3 py-2" style={{ borderColor: "var(--border)" }}>
            <Search size={15} style={{ color: "var(--text-faint)" }} />
            <input value={productQuery} onChange={(e) => setProductQuery(e.target.value)} placeholder="Search product to add manually..." className="w-full bg-transparent text-[13px] outline-none" style={{ color: "var(--text)" }} />
          </label>
          {productResults.length > 0 && (
            <div className="absolute z-10 mt-1 w-full divide-y overflow-hidden rounded-xl border shadow-lg" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              {productResults.map((p) => (
                <button key={p.id} type="button" onClick={() => { setPickerProductId(p.id); setProductQuery(""); }} className="flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-[var(--surface-2)]">
                  <span className="text-[13px] font-medium" style={{ color: "var(--text)" }}>{p.name}</span>
                  <span className="text-[12px] font-medium" style={{ color: "var(--brand)" }}>Select</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {pickerProduct && (
          <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[13px] font-medium" style={{ color: "var(--text)" }}>{pickerProduct.name} — pick a variant</p>
              <button type="button" onClick={() => setPickerProductId(null)} className="text-[12px]" style={{ color: "var(--text-muted)" }}>Close</button>
            </div>
            <table className="w-full min-w-[380px] border-collapse text-left text-[12.5px]">
              <thead><tr style={{ color: "var(--text-faint)" }}><th className="py-1.5 font-medium">Color</th><th className="py-1.5 font-medium">Size</th><th className="py-1.5 font-medium">Qty</th><th className="py-1.5" /></tr></thead>
              <tbody>
                {pickerProduct.variants.map((v) => (
                  <tr key={v.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-1.5" style={{ color: "var(--text)" }}>{v.color}</td>
                    <td className="py-1.5" style={{ color: "var(--text-muted)" }}>{v.size}</td>
                    <td className="py-1.5">
                      <input type="number" min={1} value={qtyDraft[v.id] ?? 1} onChange={(e) => setQtyDraft((prev) => ({ ...prev, [v.id]: Number(e.target.value) }))} className="w-16 rounded-lg border px-2 py-1" style={inputStyle} />
                    </td>
                    <td className="py-1.5 text-right">
                      <button type="button" onClick={() => addItem(v.id)} className="focus-ring rounded-lg px-3 py-1 text-[12px] font-semibold text-white" style={{ background: "var(--brand)" }}>Add</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {items.length > 0 && (
          <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
            <table className="w-full min-w-[640px] border-collapse text-left text-[12.5px]">
              <thead>
                <tr style={{ background: "var(--surface-2)", color: "var(--text-faint)" }}>
                  <th className="px-3 py-2 font-medium">Product</th>
                  <th className="px-3 py-2 font-medium">Qty Returning</th>
                  <th className="px-3 py-2 font-medium">Reason</th>
                  <th className="px-3 py-2 font-medium">Condition</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id} className="border-t" style={{ borderColor: "var(--border-soft)" }}>
                    <td className="px-3 py-2 font-medium" style={{ color: "var(--text)" }}>{i.productName} <span className="font-normal" style={{ color: "var(--text-muted)" }}>({i.color}/{i.size})</span></td>
                    <td className="px-3 py-2">
                      <input type="number" min={1} value={i.qty} onChange={(e) => updateItem(i.id, { qty: Math.max(1, Number(e.target.value)) })} className="w-16 rounded-lg border px-2 py-1" style={inputStyle} />
                    </td>
                    <td className="px-3 py-2">
                      <input value={i.reason} onChange={(e) => updateItem(i.id, { reason: e.target.value })} list="supplier-return-reasons" placeholder="e.g. damaged/defective" className="w-40 rounded-lg border px-2 py-1" style={inputStyle} />
                    </td>
                    <td className="px-3 py-2">
                      <select value={i.condition} onChange={(e) => updateItem(i.id, { condition: e.target.value as ItemCondition })} className="rounded-lg border px-2 py-1" style={inputStyle}>
                        <option value="new">New</option>
                        <option value="used">Used</option>
                        <option value="damaged">Damaged</option>
                      </select>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => removeItem(i.id)} className="focus-ring rounded-md p-1.5" style={{ color: "var(--text-faint)" }}><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card space-y-4 p-5">
        <p className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>Shipment / Cost</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[12.5px] font-medium" style={{ color: "var(--text-muted)" }}>Transport Cost (৳)</span>
            <input type="number" min={0} value={transportCost} onChange={(e) => setTransportCost(Number(e.target.value))} className={inputClass} style={inputStyle} />
          </label>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-[12.5px] font-medium" style={{ color: "var(--text-muted)" }}>Notes</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputClass} style={inputStyle} />
        </label>
      </section>
    </div>
  );
}
