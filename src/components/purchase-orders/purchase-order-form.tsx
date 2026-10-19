"use client";

import { useSettings } from "@/lib/settings/store";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Trash2, Package } from "lucide-react";
import { useProducts } from "@/lib/products/store";
import { useSuppliers } from "@/lib/suppliers/store";
import { usePurchaseOrders } from "@/lib/purchase-orders/store";
import { useToast } from "@/components/toast";
import { formatTaka } from "@/lib/products/utils";
import type { POItem, PurchaseOrder } from "@/lib/purchase-orders/types";

const inputStyle = { borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" };
const inputClass = "focus-ring w-full rounded-xl border px-3 py-2 text-[13px]";

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12.5px] font-medium" style={{ color: "var(--text-muted)" }}>
        {label}
        {required && <span style={{ color: "var(--red)" }}> *</span>}
      </span>
      {children}
    </label>
  );
}

export function PurchaseOrderForm({ initial, prefillItems }: { initial?: PurchaseOrder; prefillItems?: POItem[] }) {
  const isEdit = !!initial;
  const router = useRouter();
  const { products } = useProducts();
  const { suppliers } = useSuppliers();
  const { createPo, updatePo } = usePurchaseOrders();
  const showToast = useToast();

  const { settings } = useSettings();
  const defaultSupplier = suppliers.find((s) => s.id === settings.purchase.defaultSupplierId && !s.archived)?.id;
  const [supplierId, setSupplierId] = useState(initial?.supplierId ?? defaultSupplier ?? suppliers[0]?.id ?? "");
  const [poDate, setPoDate] = useState(initial?.poDate.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  const [expectedDate, setExpectedDate] = useState(initial?.expectedDate?.slice(0, 10) ?? "");
  const [notes, setNotes] = useState(initial ? (initial.notes ?? "") : settings.purchase.defaultNotes);
  const [shippingCost, setShippingCost] = useState(initial?.shippingCost ?? 0);
  const [discount, setDiscount] = useState(initial?.discount ?? 0);
  const [items, setItems] = useState<POItem[]>(initial?.items ?? prefillItems ?? []);

  const [productQuery, setProductQuery] = useState("");
  const [pickerProductId, setPickerProductId] = useState<string | null>(null);
  const [qtyDraft, setQtyDraft] = useState<Record<string, number>>({});

  const productResults = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    if (!q) return [];
    return products.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)).slice(0, 6);
  }, [productQuery, products]);

  const pickerProduct = products.find((p) => p.id === pickerProductId);

  function addItem(variantId: string) {
    const product = pickerProduct;
    const variant = product?.variants.find((v) => v.id === variantId);
    if (!product || !variant) return;
    const qty = qtyDraft[variantId] || 1;
    setItems((prev) => {
      const existing = prev.find((i) => i.variantId === variantId);
      if (existing) return prev.map((i) => (i.variantId === variantId ? { ...i, qtyOrdered: i.qtyOrdered + qty } : i));
      return [
        ...prev,
        { id: crypto.randomUUID(), productId: product.id, productName: product.name, variantId: variant.id, color: variant.color, size: variant.size, sku: variant.sku, qtyOrdered: qty, qtyReceived: 0, unitCost: variant.cost },
      ];
    });
  }

  function removeItem(id: string) {
    const item = items.find((i) => i.id === id);
    if (item && item.qtyReceived > 0) {
      showToast("Can't remove a line that already has received stock — cancel the PO instead.", "error");
      return;
    }
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  function updateItem(id: string, patch: Partial<Pick<POItem, "qtyOrdered" | "unitCost">>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  const subtotal = items.reduce((s, i) => s + i.qtyOrdered * i.unitCost, 0);
  const grandTotal = subtotal + shippingCost - discount;

  function submit(status: "draft" | "approved") {
    if (!supplierId) {
      showToast("Select a supplier", "error");
      return;
    }
    if (!items.length) {
      showToast("Add at least one product line", "error");
      return;
    }
    for (const i of items) {
      if (i.qtyOrdered < i.qtyReceived) {
        showToast(`${i.productName} (${i.color}/${i.size}) can't be reduced below its already-received quantity (${i.qtyReceived}).`, "error");
        return;
      }
    }

    if (isEdit && initial) {
      updatePo(initial.id, (po) => ({
        ...po,
        supplierId,
        poDate,
        expectedDate: expectedDate || undefined,
        notes,
        items,
        shippingCost,
        discount,
      }));
      showToast("Purchase order updated");
      router.push(`/purchase-orders/${initial.id}`);
    } else {
      const po = createPo({
        supplierId,
        poDate,
        expectedDate: expectedDate || undefined,
        notes,
        items: items.map(({ id: _id, qtyReceived: _r, ...rest }) => rest),
        shippingCost,
        discount,
        status,
      });
      showToast(`PO #${po.poNumber} created`);
      router.push(`/purchase-orders/${po.id}`);
    }
  }

  return (
    <div className="space-y-5 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[20px] font-semibold" style={{ color: "var(--text)" }}>
          {isEdit ? "Edit Purchase Order" : "Create Purchase Order"}
        </h1>
        <div className="flex gap-2">
          {!isEdit && (
            <button onClick={() => submit("draft")} className="focus-ring rounded-xl border px-3.5 py-2 text-[13px] font-medium" style={{ borderColor: "var(--border)", color: "var(--text)" }}>
              Save Draft
            </button>
          )}
          <button onClick={() => submit(isEdit ? "approved" : "approved")} className="focus-ring rounded-xl px-4 py-2 text-[13px] font-semibold text-white" style={{ background: "var(--brand)" }}>
            {isEdit ? "Save Changes" : "Save & Approve"}
          </button>
        </div>
      </div>

      <section className="card space-y-4 p-5">
        <p className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>PO Info</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Supplier" required>
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={inputClass} style={inputStyle}>
              <option value="" disabled>Select a supplier</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </Field>
          <Field label="PO Date" required>
            <input type="date" value={poDate} onChange={(e) => setPoDate(e.target.value)} className={inputClass} style={inputStyle} />
          </Field>
          <Field label="Expected Delivery Date">
            <input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} className={inputClass} style={inputStyle} />
          </Field>
        </div>
        <Field label="Notes">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputClass} style={inputStyle} />
        </Field>
      </section>

      <section className="card space-y-4 p-5">
        <p className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>Items</p>
        <div className="relative">
          <label className="flex items-center gap-2 rounded-xl border px-3 py-2" style={{ borderColor: "var(--border)" }}>
            <Search size={15} style={{ color: "var(--text-faint)" }} />
            <input value={productQuery} onChange={(e) => setProductQuery(e.target.value)} placeholder="Search product by name or SKU..." className="w-full bg-transparent text-[13px] outline-none" style={{ color: "var(--text)" }} />
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
            <table className="w-full min-w-[420px] border-collapse text-left text-[12.5px]">
              <thead>
                <tr style={{ color: "var(--text-faint)" }}>
                  <th className="py-1.5 font-medium">Color</th>
                  <th className="py-1.5 font-medium">Size</th>
                  <th className="py-1.5 font-medium">Cost</th>
                  <th className="py-1.5 font-medium">Qty</th>
                  <th className="py-1.5" />
                </tr>
              </thead>
              <tbody>
                {pickerProduct.variants.map((v) => (
                  <tr key={v.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-1.5" style={{ color: "var(--text)" }}>{v.color}</td>
                    <td className="py-1.5" style={{ color: "var(--text-muted)" }}>{v.size}</td>
                    <td className="py-1.5" style={{ color: "var(--text-muted)" }}>{formatTaka(v.cost, 2)}</td>
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

        {items.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
            <table className="w-full min-w-[600px] border-collapse text-left text-[12.5px]">
              <thead>
                <tr style={{ background: "var(--surface-2)", color: "var(--text-faint)" }}>
                  <th className="px-3 py-2 font-medium">Product</th>
                  <th className="px-3 py-2 font-medium">Variant</th>
                  <th className="px-3 py-2 font-medium">Qty Ordered</th>
                  <th className="px-3 py-2 font-medium">Unit Cost</th>
                  <th className="px-3 py-2 font-medium">Line Total</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id} className="border-t" style={{ borderColor: "var(--border-soft)" }}>
                    <td className="px-3 py-2 font-medium" style={{ color: "var(--text)" }}>{i.productName}</td>
                    <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>{i.color} / {i.size}</td>
                    <td className="px-3 py-2">
                      <input type="number" min={i.qtyReceived} value={i.qtyOrdered} onChange={(e) => updateItem(i.id, { qtyOrdered: Math.max(i.qtyReceived, Number(e.target.value)) })} className="w-20 rounded-lg border px-2 py-1" style={inputStyle} />
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" min={0} value={i.unitCost} onChange={(e) => updateItem(i.id, { unitCost: Number(e.target.value) })} className="w-24 rounded-lg border px-2 py-1" style={inputStyle} />
                    </td>
                    <td className="px-3 py-2 font-medium" style={{ color: "var(--text)" }}>{formatTaka(i.qtyOrdered * i.unitCost, 2)}</td>
                    <td className="px-3 py-2 text-right">
                      <button type="button" onClick={() => removeItem(i.id)} className="focus-ring rounded-md p-1.5" style={{ color: "var(--text-faint)" }}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-10" style={{ borderColor: "var(--border)" }}>
            <Package size={20} style={{ color: "var(--text-faint)" }} />
            <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>Search and add products above.</p>
          </div>
        )}
      </section>

      <section className="card space-y-2 p-5">
        <p className="mb-2 text-[14px] font-semibold" style={{ color: "var(--text)" }}>Cost Summary</p>
        <div className="flex items-center justify-between text-[13px]">
          <span style={{ color: "var(--text-muted)" }}>Subtotal</span>
          <span style={{ color: "var(--text)" }}>{formatTaka(subtotal, 2)}</span>
        </div>
        <div className="flex items-center justify-between text-[13px]">
          <span style={{ color: "var(--text-muted)" }}>Shipping/Handling</span>
          <input type="number" min={0} value={shippingCost} onChange={(e) => setShippingCost(Number(e.target.value))} className="w-28 rounded-lg border px-2 py-1 text-right" style={inputStyle} />
        </div>
        <div className="flex items-center justify-between text-[13px]">
          <span style={{ color: "var(--text-muted)" }}>Discount</span>
          <input type="number" min={0} value={discount} onChange={(e) => setDiscount(Number(e.target.value))} className="w-28 rounded-lg border px-2 py-1 text-right" style={inputStyle} />
        </div>
        <div className="mt-2 flex items-center justify-between border-t pt-2" style={{ borderColor: "var(--border)" }}>
          <span className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>Grand Total</span>
          <span className="text-[18px] font-bold" style={{ color: "var(--brand)" }}>{formatTaka(grandTotal, 2)}</span>
        </div>
      </section>
    </div>
  );
}
