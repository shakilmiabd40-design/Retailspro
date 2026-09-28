"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Search, Trash2, Package } from "lucide-react";
import { useProducts } from "@/lib/products/store";
import { useSettings } from "@/lib/settings/store";
import { useOrders } from "@/lib/orders/store";
import { useToast } from "@/components/toast";
import { availableStock, formatTaka } from "@/lib/products/utils";
import { detectDistrictArea } from "@/lib/orders/geo";
import type { OrderItem } from "@/lib/orders/types";

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

export default function CreateOrderPage() {
  const { products } = useProducts();
  const { createOrder } = useOrders();
  const { settings } = useSettings();
  const showToast = useToast();
  const router = useRouter();

  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [altPhone, setAltPhone] = useState("");
  const [address, setAddress] = useState("");
  const [district, setDistrict] = useState("");
  const [area, setArea] = useState("");
  const [notes, setNotes] = useState("");
  const [orderDiscount, setOrderDiscount] = useState(0);
  const [chargeOverride, setDeliveryCharge] = useState<number | null>(null);
  const deliveryCharge = chargeOverride ?? settings.orders.insideCityCharge;
  // Whenever the customer is charged ৳0 for delivery, the courier still bills the shop for it — this
  // records that real charge as a loss instead of silently assuming it was ৳0 too.
  const [courierEstimate, setCourierEstimate] = useState(0);

  useEffect(() => {
    const detected = detectDistrictArea(address);
    if (detected.district && !district) setDistrict(detected.district);
    if (detected.area && !area) setArea(detected.area);
    // Only re-run when the address text changes — deliberately not depending on
    // district/area so a value the staff clears can be re-detected on the next edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  const [productQuery, setProductQuery] = useState("");
  const [pickerProductId, setPickerProductId] = useState<string | null>(null);
  const [qtyDraft, setQtyDraft] = useState<Record<string, number>>({});
  const [items, setItems] = useState<OrderItem[]>([]);

  const productResults = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    if (!q) return [];
    const filtered = products.filter((p) => p.status === "active" && (p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)));

    // Limit to 4 items on mobile, 6 items on desktop
    // We use a CSS-based approach for the actual visibility,
    // but for the data array, we slice to the maximum possible (6).
    return filtered.slice(0, 6);
  }, [productQuery, products]);

  const pickerProduct = products.find((p) => p.id === pickerProductId);

  function addItem(variantId: string) {
    const product = pickerProduct;
    const variant = product?.variants.find((v) => v.id === variantId);
    if (!product || !variant) return;
    const qty = qtyDraft[variantId] || 1;
    const available = availableStock(variant);
    if (qty > available) {
      showToast(`Only ${available} available for ${product.name} (${variant.color}/${variant.size})`, "error");
      return;
    }
    setItems((prev) => {
      const existing = prev.find((i) => i.variantId === variantId);
      if (existing) {
        return prev.map((i) => (i.variantId === variantId ? { ...i, qty: i.qty + qty } : i));
      }
      return [
        ...prev,
        {
          id: crypto.randomUUID(),
          productId: product.id,
          productName: product.name,
          variantId: variant.id,
          color: variant.color,
          size: variant.size,
          sku: variant.sku,
          price: variant.price,
          qty,
          discount: 0,
        },
      ];
    });
    showToast(`Added ${product.name} (${variant.color}/${variant.size})`);
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  function updateItem(id: string, patch: Partial<Pick<OrderItem, "qty" | "discount">>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const itemDiscountTotal = items.reduce((s, i) => s + i.discount, 0);
  const expectedCod = subtotal - itemDiscountTotal - orderDiscount + deliveryCharge;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customerName.trim() || !phone.trim() || !address.trim()) {
      showToast("Customer name, phone and address are required", "error");
      return;
    }
    if (!items.length) {
      showToast("Add at least one product", "error");
      return;
    }
    const result = createOrder({
      customerName,
      phone,
      altPhone: altPhone || undefined,
      address,
      district: district || undefined,
      area: area || undefined,
      notes: notes || undefined,
      deliveryCharge,
      orderDiscount,
      freeDeliveryCourierCost: deliveryCharge === 0 ? courierEstimate : undefined,
      items: items.map(({ id: _id, ...rest }) => rest),
    });
    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    showToast(`Order #${result.order.orderNumber} created`);
    router.push(`/orders/${result.order.id}`);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 pb-10">
      <Link href="/orders" className="focus-ring flex items-center gap-1.5 text-[12.5px] font-medium" style={{ color: "var(--text-muted)" }}>
        <ArrowLeft size={14} />
        Back to Orders
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-semibold" style={{ color: "var(--text)" }}>
            Create Order
          </h1>
          <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
            Add customer details, products, and confirm the expected COD.
          </p>
        </div>
        <button
          type="submit"
          className="focus-ring rounded-xl px-4 py-2 text-[13px] font-semibold text-white"
          style={{ background: "var(--brand)" }}
        >
          Save Order
        </button>
      </div>

      {/* Section A — Customer Information */}
      <section className="card space-y-4 p-5">
        <p className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>
          Customer Information
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Customer Name" required>
            <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className={inputClass} style={inputStyle} />
          </Field>
          <Field label="Phone" required>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01XXXXXXXXX" className={inputClass} style={inputStyle} />
          </Field>
          <Field label="Alternative Phone">
            <input value={altPhone} onChange={(e) => setAltPhone(e.target.value)} className={inputClass} style={inputStyle} />
          </Field>
          <Field label="District">
            <input value={district} onChange={(e) => setDistrict(e.target.value)} placeholder="e.g. Dhaka" className={inputClass} style={inputStyle} />
          </Field>
          <Field label="Area">
            <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="e.g. Mirpur" className={inputClass} style={inputStyle} />
          </Field>
          <Field label="Customer Delivery Charge (৳)">
            <input type="number" min={0} value={deliveryCharge} onChange={(e) => setDeliveryCharge(Number(e.target.value))} className={inputClass} style={inputStyle} />
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {[
                { label: `Inside city ৳${settings.orders.insideCityCharge}`, value: settings.orders.insideCityCharge, show: true },
                { label: `Dhaka Sub ৳${settings.orders.subCityCharge}`, value: settings.orders.subCityCharge, show: true },
                { label: `Outside city ৳${settings.orders.outsideCityCharge}`, value: settings.orders.outsideCityCharge, show: true },
                { label: "Free delivery", value: 0, show: settings.orders.freeDeliveryEnabled && subtotal - itemDiscountTotal - orderDiscount >= settings.orders.freeDeliveryMinSubtotal },
              ]
                .filter((o) => o.show)
                .map((o) => (
                  <button
                    key={o.label}
                    type="button"
                    onClick={() => {
                      setDeliveryCharge(o.value);
                      if (o.value === 0) setCourierEstimate((v) => v || settings.orders.insideCityCharge);
                      else setCourierEstimate(0);
                    }}
                    className="focus-ring rounded-full border px-2.5 py-1 text-[11.5px] font-medium"
                    style={{ borderColor: deliveryCharge === o.value ? "var(--brand)" : "var(--border)", color: deliveryCharge === o.value ? "var(--brand-strong)" : "var(--text-muted)" }}
                  >
                    {o.label}
                  </button>
                ))}
            </div>
            {deliveryCharge === 0 && (
              <div className="mt-2 rounded-lg border p-2.5" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                <label className="text-[11.5px] font-medium" style={{ color: "var(--text-muted)" }}>
                  Courier still charges this much (৳) — counted as a loss, not charged to the customer
                </label>
                <input
                  type="number"
                  min={0}
                  value={courierEstimate}
                  onChange={(e) => setCourierEstimate(Math.max(0, Number(e.target.value) || 0))}
                  className={`${inputClass} mt-1`}
                  style={inputStyle}
                />
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {[
                    { label: `Inside city ৳${settings.orders.insideCityCharge}`, value: settings.orders.insideCityCharge },
                    { label: `Dhaka Sub ৳${settings.orders.subCityCharge}`, value: settings.orders.subCityCharge },
                    { label: `Outside city ৳${settings.orders.outsideCityCharge}`, value: settings.orders.outsideCityCharge },
                  ].map((o) => (
                    <button key={o.label} type="button" onClick={() => setCourierEstimate(o.value)} className="focus-ring rounded-full border px-2.5 py-1 text-[11.5px] font-medium" style={{ borderColor: courierEstimate === o.value ? "var(--brand)" : "var(--border)", color: courierEstimate === o.value ? "var(--brand-strong)" : "var(--text-muted)" }}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Field>
        </div>
        <Field label="Address" required>
          <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} className={inputClass} style={inputStyle} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Order Discount (৳)">
            <input
              type="number"
              min={0}
              value={orderDiscount}
              onChange={(e) => setOrderDiscount(Math.max(0, Number(e.target.value)))}
              className={inputClass}
              style={inputStyle}
              placeholder="Enter overall discount"
            />
          </Field>
          <Field label="Notes">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Any special instructions..." className={inputClass} style={inputStyle} />
          </Field>
        </div>
      </section>

      {/* Section B — Products */}
      <section className="card space-y-4 p-5">
        <p className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>
          Products
        </p>

        <div className="relative">
          <label className="flex items-center gap-2 rounded-xl border px-3 py-2" style={{ borderColor: "var(--border)" }}>
            <Search size={15} style={{ color: "var(--text-faint)" }} />
            <input
              value={productQuery}
              onChange={(e) => setProductQuery(e.target.value)}
              placeholder="Search product by name or SKU..."
              className="w-full bg-transparent text-[13px] outline-none"
              style={{ color: "var(--text)" }}
            />
          </label>
          {productResults.length > 0 && (
            <div className="absolute z-10 mt-1 w-full divide-y overflow-hidden rounded-xl border shadow-lg" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              {productResults.map((p, index) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setPickerProductId(p.id);
                    setProductQuery("");
                  }}
                  className={`flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-[var(--surface-2)] ${index >= 4 ? "hidden sm:flex" : "flex"}`}
                >
                  <span>
                    <span className="block text-[13px] font-medium" style={{ color: "var(--text)" }}>
                      {p.name}
                    </span>
                    <span className="block text-[11.5px]" style={{ color: "var(--text-faint)" }}>
                      {p.sku} · {formatTaka(p.sellingPrice, 2)}
                    </span>
                  </span>
                  <span className="text-[12px] font-medium" style={{ color: "var(--brand)" }}>
                    Select
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {pickerProduct && (
          <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[13px] font-medium" style={{ color: "var(--text)" }}>
                {pickerProduct.name} — pick a variant
              </p>
              <button type="button" onClick={() => setPickerProductId(null)} className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                Close
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] border-collapse text-left text-[12.5px]">
                <thead>
                  <tr style={{ color: "var(--text-faint)" }}>
                    <th className="py-1.5 font-medium">Color</th>
                    <th className="py-1.5 font-medium">Size</th>
                    <th className="py-1.5 font-medium">Available</th>
                    <th className="py-1.5 font-medium">Qty</th>
                    <th className="py-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {pickerProduct.variants.map((v) => {
                    const available = availableStock(v);
                    return (
                      <tr key={v.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                        <td className="py-1.5" style={{ color: "var(--text)" }}>
                          {v.color}
                        </td>
                        <td className="py-1.5" style={{ color: "var(--text-muted)" }}>
                          {v.size}
                        </td>
                        <td className="py-1.5" style={{ color: available > 0 ? "var(--text-muted)" : "var(--red)" }}>
                          {available}
                        </td>
                        <td className="py-1.5">
                          <input
                            type="number"
                            min={1}
                            max={Math.max(1, available)}
                            disabled={available <= 0}
                            value={qtyDraft[v.id] ?? 1}
                            onChange={(e) => setQtyDraft((prev) => ({ ...prev, [v.id]: Number(e.target.value) }))}
                            className="w-16 rounded-lg border px-2 py-1"
                            style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
                          />
                        </td>
                        <td className="py-1.5 text-right">
                          <button
                            type="button"
                            disabled={available <= 0}
                            onClick={() => addItem(v.id)}
                            className="focus-ring rounded-lg px-3 py-1 text-[12px] font-semibold text-white disabled:opacity-40"
                            style={{ background: "var(--brand)" }}
                          >
                            Add
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {items.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
            <table className="w-full min-w-[560px] border-collapse text-left text-[12.5px]">
              <thead>
                <tr style={{ background: "var(--surface-2)", color: "var(--text-faint)" }}>
                  <th className="px-3 py-2 font-medium">Product</th>
                  <th className="px-3 py-2 font-medium">Variant</th>
                  <th className="px-3 py-2 font-medium">Qty</th>
                  <th className="px-3 py-2 font-medium">Price</th>
                  <th className="px-3 py-2 font-medium">Discount</th>
                  <th className="px-3 py-2 font-medium">Total</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id} className="border-t" style={{ borderColor: "var(--border-soft)" }}>
                    <td className="px-3 py-2 font-medium" style={{ color: "var(--text)" }}>
                      {i.productName}
                    </td>
                    <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>
                      {i.color} / {i.size}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={1}
                        value={i.qty}
                        onChange={(e) => updateItem(i.id, { qty: Math.max(1, Number(e.target.value)) })}
                        className="w-16 rounded-lg border px-2 py-1"
                        style={inputStyle}
                      />
                    </td>
                    <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>
                      {formatTaka(i.price, 2)}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        value={i.discount}
                        onChange={(e) => updateItem(i.id, { discount: Math.max(0, Number(e.target.value)) })}
                        className="w-20 rounded-lg border px-2 py-1"
                        style={inputStyle}
                      />
                    </td>
                    <td className="px-3 py-2 font-medium" style={{ color: "var(--text)" }}>
                      {formatTaka(i.price * i.qty - i.discount, 2)}
                    </td>
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
            <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
              Search and add products above.
            </p>
          </div>
        )}
      </section>

      {/* Section C — Amount Calculation */}
      <section className="card space-y-2 p-5">
        <p className="mb-2 text-[14px] font-semibold" style={{ color: "var(--text)" }}>
          Amount Calculation
        </p>
        <SummaryRow label="Product Subtotal" value={formatTaka(subtotal, 2)} />
        <SummaryRow label="Item Discounts" value={`- ${formatTaka(itemDiscountTotal, 2)}`} muted />
        <SummaryRow label="Order Discount" value={`- ${formatTaka(orderDiscount, 2)}`} muted />
        <SummaryRow label="Customer Delivery Charge" value={`+ ${formatTaka(deliveryCharge, 2)}`} muted />
        {deliveryCharge === 0 && courierEstimate > 0 && <SummaryRow label="Free Delivery — Courier Cost (loss, not part of COD)" value={formatTaka(courierEstimate, 2)} muted />}
        <div className="mt-2 flex items-center justify-between border-t pt-2" style={{ borderColor: "var(--border)" }}>
          <span className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>
            Expected COD
          </span>
          <span className="text-[18px] font-bold" style={{ color: "var(--brand)" }}>
            {formatTaka(expectedCod, 2)}
          </span>
        </div>
      </section>
    </form>
  );
}

function SummaryRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between text-[13px]">
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span style={{ color: muted ? "var(--text-muted)" : "var(--text)" }}>{value}</span>
    </div>
  );
}
