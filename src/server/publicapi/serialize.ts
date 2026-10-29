import type { Order } from "@/lib/orders/types";
import type { Product, Variant } from "@/lib/products/types";

/**
 * The public shape of products and orders. Deliberately NOT the internal shape: it is snake_case,
 * stable across dashboard refactors, and leaves out internal-only data (cost prices, courier costs,
 * settlement status, staff names).
 */

export const CURRENCY = "BDT";

const available = (v: Pick<Variant, "stock" | "reserved">) => Math.max(0, (v.stock ?? 0) - (v.reserved ?? 0));

export function toApiVariant(v: Variant) {
  return {
    id: v.id,
    sku: v.sku,
    barcode: v.barcode || null,
    color: v.color,
    size: v.size,
    price: v.price,
    status: v.status,
    stock: v.stock,
    reserved: v.reserved ?? 0,
    /** What can still be sold right now: stock − reserved. Use this number on the storefront. */
    available: available(v),
  };
}

export function toApiProduct(p: Product) {
  return {
    id: p.id,
    sku: p.sku,
    barcode: p.barcode || null,
    name: p.name,
    brand: p.brand,
    category: p.category,
    description: p.description || null,
    status: p.status,
    image_url: p.imageUrl || null,
    gender: p.gender ?? null,
    shoe_type: p.shoeType ?? null,
    material: p.material ?? null,
    currency: CURRENCY,
    selling_price: p.sellingPrice,
    discount_price: p.discountPrice ?? null,
    colors: p.colors,
    sizes: p.sizes,
    variants: p.variants.map(toApiVariant),
    total_available: p.variants.reduce((s, v) => s + (v.status === "active" ? available(v) : 0), 0),
    created_at: p.createdAt,
  };
}
export type ApiProduct = ReturnType<typeof toApiProduct>;

export function toApiOrder(o: Order) {
  const subtotal = o.items.reduce((s, i) => s + i.price * i.qty, 0);
  const discountTotal = o.items.reduce((s, i) => s + i.discount, 0);
  // Order-level discount (a newer dashboard feature); older orders don't have it.
  const orderDiscount = Number((o as { orderDiscount?: number }).orderDiscount ?? 0) || 0;
  return {
    id: o.id,
    order_number: o.orderNumber,
    external_id: o.externalId ?? null,
    channel: o.channel ?? (o.source === "pos" ? "pos" : "dashboard"),
    status: o.status,
    customer: {
      name: o.customerName,
      phone: o.phone,
      alt_phone: o.altPhone || null,
      address: o.address,
      district: o.district || null,
      area: o.area || null,
    },
    notes: o.notes || null,
    items: o.items.map((i) => ({
      product_id: i.productId,
      variant_id: i.variantId,
      sku: i.sku,
      name: i.productName,
      color: i.color,
      size: i.size,
      unit_price: i.price,
      qty: i.qty,
      discount: i.discount,
      line_total: i.price * i.qty - i.discount,
    })),
    currency: CURRENCY,
    amounts: {
      subtotal,
      discount_total: discountTotal + orderDiscount,
      delivery_charge: o.deliveryCharge,
      /** Cash the courier should collect: subtotal − discounts + delivery charge. */
      expected_cod: subtotal - discountTotal - orderDiscount + o.deliveryCharge,
    },
    courier: {
      company: o.courier?.company || null,
      tracking_id: o.courier?.trackingId || null,
      dispatch_date: o.courier?.dispatchDate ?? null,
    },
    delivery: {
      collected_amount: o.status === "delivered" || o.status === "partial_delivered" ? o.delivery?.customerPaid ?? 0 : null,
      delivery_date: o.delivery?.deliveryDate ?? null,
    },
    cancellation:
      o.status === "cancelled"
        ? { cancelled_at: o.cancellation?.cancelledAt ?? null, reason: o.cancellation?.reason ?? null, notes: o.cancellation?.notes ?? null }
        : null,
    timeline: o.activity.map((a) => ({ at: a.at, label: a.label, detail: a.detail ?? null })),
    created_at: o.createdAt,
    updated_at: o.updatedAt,
  };
}
export type ApiOrder = ReturnType<typeof toApiOrder>;
