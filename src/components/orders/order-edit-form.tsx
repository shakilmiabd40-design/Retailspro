"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Search, Trash2, Package, ShieldCheck } from "lucide-react";
import { useProducts } from "@/lib/products/store";
import { useOrders } from "@/lib/orders/store";
import { useToast } from "@/components/toast";
import { availableStock, formatTaka } from "@/lib/products/utils";
import { cancelReasonLabel, ORDER_STATUS_LABELS } from "@/lib/orders/utils";
import { useAutoGeo } from "@/lib/orders/use-auto-geo";
import { useSettings } from "@/lib/settings/store";
import type { CancelReason, Order, OrderItem, OrderStatus, SettlementStatus } from "@/lib/orders/types";

const inputStyle = { borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" };
const inputClass = "focus-ring w-full rounded-xl border px-3 py-2 text-[13px]";

const ALL_STATUSES: OrderStatus[] = ["pending", "processing", "in_transit", "delivered", "partial_delivered", "refuse_return", "cancelled"];

/** ISO timestamp or date string → value for <input type="date">. */
function toDateInput(value?: string): string {
  if (!value) return "";
  return value.length >= 10 ? value.slice(0, 10) : value;
}

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

function NumberInput({ value, onChange, min = 0 }: { value: number; onChange: (n: number) => void; min?: number }) {
  return (
    <input
      type="number"
      min={min}
      value={Number.isFinite(value) ? value : 0}
      onChange={(e) => onChange(Number(e.target.value))}
      className={inputClass}
      style={inputStyle}
    />
  );
}

export function OrderEditForm({ order }: { order: Order }) {
  const { products } = useProducts();
  const { editOrder } = useOrders();
  const { settings } = useSettings();
  const showToast = useToast();
  const router = useRouter();

  const [status, setStatus] = useState<OrderStatus>(order.status);

  const [customerName, setCustomerName] = useState(order.customerName);
  const [phone, setPhone] = useState(order.phone);
  const [altPhone, setAltPhone] = useState(order.altPhone ?? "");
  const [address, setAddress] = useState(order.address);
  const { district, area, setDistrict, setArea } = useAutoGeo(address, { district: order.district, area: order.area });
  const [notes, setNotes] = useState(order.notes ?? "");
  const [deliveryCharge, setDeliveryCharge] = useState(order.deliveryCharge);

  const [items, setItems] = useState<OrderItem[]>(order.items);
  const [productQuery, setProductQuery] = useState("");
  const [pickerProductId, setPickerProductId] = useState<string | null>(null);
  const [qtyDraft, setQtyDraft] = useState<Record<string, number>>({});

  const [company, setCompany] = useState(order.courier.company);
  const [trackingId, setTrackingId] = useState(order.courier.trackingId);
  const [dispatchDate, setDispatchDate] = useState(toDateInput(order.courier.dispatchDate));
  const [forwardCost, setForwardCost] = useState(order.courier.forwardCost);
  const [returnCost, setReturnCost] = useState(order.courier.returnCost);
  const [otherCost, setOtherCost] = useState(order.courier.otherCost);

  const [customerPaid, setCustomerPaid] = useState(order.delivery.customerPaid);
  const [deliveryDate, setDeliveryDate] = useState(toDateInput(order.delivery.deliveryDate));
  const [settlement, setSettlement] = useState<SettlementStatus | "">(order.delivery.settlementStatus ?? "");

  const [returnReceived, setReturnReceived] = useState(order.returnInfo.returnReceived);

  const [cancelReason, setCancelReason] = useState<CancelReason>(order.cancellation.reason ?? settings.orders.cancelReasons[0] ?? "Other");
  const [cancelNotes, setCancelNotes] = useState(order.cancellation.notes ?? "");

  const isReturnStatus = status === "partial_delivered" || status === "refuse_return";
  const showDelivery = status === "delivered" || isReturnStatus;

  const productResults = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    if (!q) return [];
    return products.filter((p) => p.status === "active" && (p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))).slice(0, 6);
  }, [productQuery, products]);

  const pickerProduct = products.find((p) => p.id === pickerProductId);

  function addItem(variantId: string) {
    const product = pickerProduct;
    const variant = product?.variants.find((v) => v.id === variantId);
    if (!product || !variant) return;
    const qty = qtyDraft[variantId] || 1;
    // Stock is validated authoritatively on save (it credits what this order already holds).
    setItems((prev) => {
      const existing = prev.find((i) => i.variantId === variantId);
      if (existing) return prev.map((i) => (i.variantId === variantId ? { ...i, qty: i.qty + qty } : i));
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

  function updateItem(id: string, patch: Partial<Pick<OrderItem, "qty" | "discount" | "price">>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const discountTotal = items.reduce((s, i) => s + i.discount, 0);
  const expectedCod = subtotal - discountTotal + deliveryCharge;

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
    const result = editOrder(order.id, {
      status,
      customerName: customerName.trim(),
      phone: phone.trim(),
      altPhone: altPhone.trim() || undefined,
      address: address.trim(),
      district: district.trim() || undefined,
      area: area.trim() || undefined,
      notes: notes.trim() || undefined,
      items,
      deliveryCharge,
      courier: {
        company: company.trim(),
        trackingId: trackingId.trim(),
        dispatchDate: dispatchDate || undefined,
        forwardCost,
        returnCost,
        otherCost,
      },
      delivery: {
        customerPaid,
        deliveryDate: deliveryDate || undefined,
        settlementStatus: settlement || undefined,
      },
      returnInfo: { returnRequired: isReturnStatus, returnReceived },
      cancellation: { reason: cancelReason, notes: cancelNotes.trim() || undefined },
    });
    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    showToast(`Order #${order.orderNumber} updated`);
    router.push(`/orders/${order.id}`);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 pb-10">
      <Link href={`/orders/${order.id}`} className="focus-ring flex items-center gap-1.5 text-[12.5px] font-medium" style={{ color: "var(--text-muted)" }}>
        <ArrowLeft size={14} />
        Back to Order
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold" style={{ color: "var(--text)" }}>
            Edit Order #{order.orderNumber}
          </h1>
          <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
            Super Admin mode — editable at any status.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/orders/${order.id}`}
            className="focus-ring rounded-xl border px-4 py-2 text-[13px] font-medium"
            style={{ borderColor: "var(--border)", color: "var(--text)" }}
          >
            Cancel
          </Link>
          <button type="submit" className="focus-ring rounded-xl px-4 py-2 text-[13px] font-semibold text-white" style={{ background: "var(--brand)" }}>
            Save Changes
          </button>
        </div>
      </div>

      <div className="flex items-start gap-2.5 rounded-xl border p-3.5 text-[12.5px]" style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--text-muted)" }}>
        <ShieldCheck size={16} className="mt-0.5 shrink-0" style={{ color: "var(--brand)" }} />
        <p>
          Changes to products or status automatically adjust reserved/sold stock and warranties. Every edit is recorded in the order&apos;s activity log.
        </p>
      </div>

      {/* Status */}
      <section className="card space-y-4 p-5">
        <p className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>
          Order Status
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Status">
            <select value={status} onChange={(e) => setStatus(e.target.value as OrderStatus)} className={inputClass} style={inputStyle}>
              {ALL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {ORDER_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </Field>
          {isReturnStatus && (
            <Field label="Return received?">
              <label className="flex items-center gap-2 rounded-xl border px-3 py-2 text-[13px]" style={{ borderColor: "var(--border)", color: "var(--text)" }}>
                <input type="checkbox" checked={returnReceived} onChange={(e) => setReturnReceived(e.target.checked)} />
                Parcel is back — stock restored
              </label>
            </Field>
          )}
        </div>

        {status === "cancelled" && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Cancel Reason">
              <select value={cancelReason} onChange={(e) => setCancelReason(e.target.value as CancelReason)} className={inputClass} style={inputStyle}>
                {[...new Set([cancelReason, ...settings.orders.cancelReasons])].map((r) => (
                  <option key={r} value={r}>
                    {cancelReasonLabel(r)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Cancellation Notes">
              <input value={cancelNotes} onChange={(e) => setCancelNotes(e.target.value)} className={inputClass} style={inputStyle} />
            </Field>
          </div>
        )}
      </section>

      {/* Customer */}
      <section className="card space-y-4 p-5">
        <p className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>
          Customer Information
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Customer Name" required>
            <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className={inputClass} style={inputStyle} />
          </Field>
          <Field label="Phone" required>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} style={inputStyle} />
          </Field>
          <Field label="Alternative Phone">
            <input value={altPhone} onChange={(e) => setAltPhone(e.target.value)} className={inputClass} style={inputStyle} />
          </Field>
          <Field label="District">
            <input value={district} onChange={(e) => setDistrict(e.target.value)} className={inputClass} style={inputStyle} />
          </Field>
          <Field label="Area">
            <input value={area} onChange={(e) => setArea(e.target.value)} className={inputClass} style={inputStyle} />
          </Field>
          <Field label="Customer Delivery Charge (৳)">
            <NumberInput value={deliveryCharge} onChange={setDeliveryCharge} />
          </Field>
        </div>
        <Field label="Address" required>
          <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} className={inputClass} style={inputStyle} />
        </Field>
        <Field label="Notes">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputClass} style={inputStyle} />
        </Field>
      </section>

      {/* Products */}
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
              placeholder="Search product by name or SKU to add..."
              className="w-full bg-transparent text-[13px] outline-none"
              style={{ color: "var(--text)" }}
            />
          </label>
          {productResults.length > 0 && (
            <div className="absolute z-10 mt-1 w-full divide-y overflow-hidden rounded-xl border shadow-lg" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              {productResults.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setPickerProductId(p.id);
                    setProductQuery("");
                  }}
                  className="flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-[var(--surface-2)]"
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
                  {pickerProduct.variants.map((v) => (
                    <tr key={v.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className="py-1.5" style={{ color: "var(--text)" }}>
                        {v.color}
                      </td>
                      <td className="py-1.5" style={{ color: "var(--text-muted)" }}>
                        {v.size}
                      </td>
                      <td className="py-1.5" style={{ color: "var(--text-muted)" }}>
                        {availableStock(v)}
                      </td>
                      <td className="py-1.5">
                        <input
                          type="number"
                          min={1}
                          value={qtyDraft[v.id] ?? 1}
                          onChange={(e) => setQtyDraft((prev) => ({ ...prev, [v.id]: Math.max(1, Number(e.target.value)) }))}
                          className="w-16 rounded-lg border px-2 py-1"
                          style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
                        />
                      </td>
                      <td className="py-1.5 text-right">
                        <button
                          type="button"
                          onClick={() => addItem(v.id)}
                          className="focus-ring rounded-lg px-3 py-1 text-[12px] font-semibold text-white"
                          style={{ background: "var(--brand)" }}
                        >
                          Add
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {items.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
            <table className="w-full min-w-[640px] border-collapse text-left text-[12.5px]">
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
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        value={i.price}
                        onChange={(e) => updateItem(i.id, { price: Math.max(0, Number(e.target.value)) })}
                        className="w-24 rounded-lg border px-2 py-1"
                        style={inputStyle}
                      />
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
                      <button
                        type="button"
                        onClick={() => setItems((prev) => prev.filter((x) => x.id !== i.id))}
                        className="focus-ring rounded-md p-1.5"
                        style={{ color: "var(--text-faint)" }}
                        aria-label="Remove item"
                      >
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

      {/* Courier */}
      <section className="card space-y-4 p-5">
        <p className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>
          Courier Information
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Courier Company">
            <input value={company} onChange={(e) => setCompany(e.target.value)} className={inputClass} style={inputStyle} />
          </Field>
          <Field label="Tracking ID">
            <input value={trackingId} onChange={(e) => setTrackingId(e.target.value)} className={inputClass} style={inputStyle} />
          </Field>
          <Field label="Dispatch Date">
            <input type="date" value={dispatchDate} onChange={(e) => setDispatchDate(e.target.value)} className={inputClass} style={inputStyle} />
          </Field>
          <Field label="Forward Cost (৳)">
            <NumberInput value={forwardCost} onChange={setForwardCost} />
          </Field>
          <Field label="Return Cost (৳)">
            <NumberInput value={returnCost} onChange={setReturnCost} />
          </Field>
          <Field label="Other Cost (৳)">
            <NumberInput value={otherCost} onChange={setOtherCost} />
          </Field>
        </div>
      </section>

      {/* Delivery result */}
      {showDelivery && (
        <section className="card space-y-4 p-5">
          <p className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>
            Delivery Result
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {status !== "refuse_return" && (
              <Field label="Customer Paid (৳)">
                <NumberInput value={customerPaid} onChange={setCustomerPaid} />
              </Field>
            )}
            <Field label="Delivery Date">
              <input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} className={inputClass} style={inputStyle} />
            </Field>
            <Field label="Settlement Status">
              <select value={settlement} onChange={(e) => setSettlement(e.target.value as SettlementStatus | "")} className={inputClass} style={inputStyle}>
                <option value="">Not set</option>
                <option value="settled">Settled</option>
                <option value="pending">Pending</option>
              </select>
            </Field>
          </div>
        </section>
      )}

      {/* Amounts */}
      <section className="card space-y-2 p-5">
        <p className="mb-2 text-[14px] font-semibold" style={{ color: "var(--text)" }}>
          Amount Calculation
        </p>
        <SummaryRow label="Product Subtotal" value={formatTaka(subtotal, 2)} />
        <SummaryRow label="Discount" value={`- ${formatTaka(discountTotal, 2)}`} muted />
        <SummaryRow label="Customer Delivery Charge" value={`+ ${formatTaka(deliveryCharge, 2)}`} muted />
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
