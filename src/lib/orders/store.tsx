"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useProducts } from "@/lib/products/store";
import type { StockLineItem } from "@/lib/products/store";
import { useWarranty } from "@/lib/warranty/store";
import { runtime } from "@/lib/settings/runtime";
import { useSettings } from "@/lib/settings/store";
import { useCollection } from "@/lib/persist/hooks";
import { ordersCollectionActive } from "./routes";
import { takeNumber } from "@/lib/persist/numbers";
import { cancelReasonLabel, canCancelOrder, describeOrderChanges, foldOrderDiscount } from "./utils";
import type {
  CancelReason,
  CancellationInfo,
  CourierInfo,
  DeliveryResult,
  Order,
  OrderExchange,
  OrderItem,
  OrderStatus,
  ReturnInfo,
  SettlementStatus,
} from "./types";


export type NewOrderInput = {
  customerName: string;
  phone: string;
  altPhone?: string;
  address: string;
  district?: string;
  area?: string;
  notes?: string;
  items: Omit<OrderItem, "id">[];
  deliveryCharge: number;
  /** Overall discount in ৳; saved by spreading it over the order's lines. */
  orderDiscount?: number;
  /**
   * Set only for a Free Delivery order: what the courier actually charges even though the customer pays
   * ৳0. Saved straight onto the order as its starting courier cost, so it counts as a loss from day one
   * instead of silently showing ৳0 until someone remembers to fix it at dispatch.
   */
  freeDeliveryCourierCost?: number;
  pos?: { invoiceId: string; invoiceNumber: string };
  /** Exchange for a delivered order: its id, and the value of the goods coming back (credited against the COD). */
  exchange?: { originalOrderId: string; credit: number };
};

export type DispatchInput = {
  company: string;
  trackingId: string;
  dispatchDate: string;
  forwardCost: number;
};

export type DeliveredInput = {
  customerPaid: number;
  deliveryDate: string;
  settlementStatus: SettlementStatus;
  /** The delivery charge the courier actually confirms (forward leg). Entered once the courier has the parcel. */
  forwardCost?: number;
};

export type PartialInput = {
  customerPaid: number;
  itemsKept: { itemId: string; qty: number }[];
  forwardCost?: number;
  returnCost: number;
  otherCost: number;
  reason?: string;
};

export type RefuseInput = {
  forwardCost?: number;
  returnCost: number;
  otherCost: number;
};

/** Courier charges as confirmed by the courier (delivery / return / other), fixable any time after dispatch. */
export type CourierChargesInput = {
  forwardCost: number;
  returnCost: number;
  otherCost: number;
};

export type CancelInput = {
  reason: CancelReason;
  notes?: string;
  cancelledBy?: string;
};

/** Super Admin edit — every field of an order can be rewritten, whatever its status. */
export type EditOrderInput = {
  status: OrderStatus;
  customerName: string;
  phone: string;
  altPhone?: string;
  address: string;
  district?: string;
  area?: string;
  notes?: string;
  items: OrderItem[];
  deliveryCharge: number;
  courier: CourierInfo;
  delivery: DeliveryResult;
  returnInfo: ReturnInfo;
  cancellation: CancellationInfo;
};

function itemsAsLineItems(items: OrderItem[]): StockLineItem[] {
  return items.map((i) => ({ productId: i.productId, variantId: i.variantId, qty: i.qty }));
}

function stockBuckets(order: Order): { reserved: StockLineItem[]; consumed: StockLineItem[] } {
  if (order.status === "delivered") return { reserved: [], consumed: itemsAsLineItems(order.items) };
  if (order.status === "partial_delivered" && order.delivery.itemsKept) {
    const kept = new Map(order.delivery.itemsKept.map((item) => [item.itemId, item.qty]));
    const consumed = order.items.map((i) => ({ productId: i.productId, variantId: i.variantId, qty: Math.min(i.qty, Math.max(0, kept.get(i.id) ?? 0)) })).filter((i) => i.qty > 0);
    const reserved = order.returnInfo.returnReceived ? [] : order.items.map((i) => ({ productId: i.productId, variantId: i.variantId, qty: i.qty - Math.min(i.qty, Math.max(0, kept.get(i.id) ?? 0)) })).filter((i) => i.qty > 0);
    return { reserved, consumed };
  }
  if (order.status === "cancelled" || (order.status === "refuse_return" && order.returnInfo.returnReceived)) return { reserved: [], consumed: [] };
  return { reserved: itemsAsLineItems(order.items), consumed: [] };
}

function activity(label: string, detail?: string) {
  return { id: crypto.randomUUID(), at: new Date().toISOString(), label, detail, by: runtime.actor.name };
}

interface OrdersContextValue {
  orders: Order[];
  hydrated: boolean;
  getOrder: (id: string) => Order | undefined;
  statusCounts: Record<OrderStatus | "all", number>;
  createOrder: (input: NewOrderInput) => { ok: true; order: Order } | { ok: false; error: string };
  markProcessing: (id: string, courierInfo?: Partial<CourierInfo>) => void;
  /** Saves a Steadfast booking without treating it as in transit until Steadfast reports `pending`. */
  recordSteadfastBooking: (id: string, trackingId: string, company?: string) => void;
  dispatchOrder: (id: string, input: DispatchInput) => void;
  markDelivered: (id: string, input: DeliveredInput) => void;
  markPartialDelivered: (id: string, input: PartialInput) => void;
  markRefuseReturn: (id: string, input: RefuseInput) => void;
  markReturnReceived: (id: string) => void;
  /**
   * Fixes the courier's confirmed charges (delivery / return / other) on an already-dispatched order.
   * The courier usually confirms its real delivery fee only after it has the parcel, so this can be used
   * while In Transit and on any delivered outcome — the new amounts flow into every cost/profit figure.
   */
  updateCourierCharges: (id: string, input: CourierChargesInput) => { ok: true } | { ok: false; error: string };
  /** Corrects the amount actually collected by the courier on a delivered order. */
  updateCustomerPaid: (id: string, amount: number) => { ok: true } | { ok: false; error: string };
  exchangeDeliveredOrder: (id: string, returned: { itemId: string; qty: number }[], given: Omit<OrderItem, "id">[]) => { ok: true; exchange: OrderExchange } | { ok: false; error: string };
  cancelOrder: (id: string, input: CancelInput) => { ok: true } | { ok: false; error: string };
  /** Super Admin: edit any order at any status. Stock and warranties are reconciled automatically. */
  editOrder: (id: string, input: EditOrderInput) => { ok: true } | { ok: false; error: string };
  /** Super Admin: permanently delete an order at any status. Stock and warranties are reconciled. */
  deleteOrder: (id: string) => { ok: true } | { ok: false; error: string };
  /**
   * Removes an order from LOCAL state only — no API call, no stock reconciliation. For when the order (and the
   * stock reservation it came with) turns out never to have reached the server: a same-instant conflict tore up
   * the whole compound write, so it was never really created and there is nothing server-side to undo.
   */
  discardOrder: (id: string) => void;
  /** Keeps each order's Settled / Pending flag in step with the courier payout ledger (no edit-history side effects). */
  setSettlementFlags: (flags: Record<string, SettlementStatus>) => void;
}

const OrdersContext = createContext<OrdersContextValue | null>(null);

export function OrdersProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const { reserveStock, releaseStock, consumeStock, restoreStock, sellStock, products } = useProducts();
  const { createWarrantiesForOrder, voidWarrantiesForOrderItem } = useWarranty();
  const { settings } = useSettings();
  // Settings → Orders: when "Return Received" isn't mandatory, stock is released the moment the outcome is recorded.
  const autoReceiveReturns = !settings.orders.returnReceivedMandatory;
  // Keep the full collection only on order workflows, screens that read order-linked data,
  // and reports that still use client-side report calculations. Other modules use summary APIs.
  const ordersActive = ordersCollectionActive(pathname);
  const [orders, setOrders, hydrated] = useCollection<Order>("orders", undefined, ordersActive);

  const getOrder = (id: string) => orders.find((o) => o.id === id);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: orders.length,
      pending: 0,
      processing: 0,
      in_transit: 0,
      delivered: 0,
      partial_delivered: 0,
      refuse_return: 0,
      cancelled: 0,
    };
    for (const o of orders) counts[o.status] += 1;
    return counts as Record<OrderStatus | "all", number>;
  }, [orders]);

  function createOrder(input: NewOrderInput): { ok: true; order: Order } | { ok: false; error: string } {
    if (!input.items.length) return { ok: false, error: "Add at least one product to the order." };

    const orderDiscount = input.orderDiscount ?? 0;
    const lineNet = input.items.reduce((sum, i) => sum + i.price * i.qty - i.discount, 0);
    if (!(orderDiscount >= 0)) return { ok: false, error: "Order discount can't be negative." };
    const freeDeliveryCourierCost = input.freeDeliveryCourierCost ?? 0;
    if (!(freeDeliveryCourierCost >= 0)) return { ok: false, error: "Courier charge can't be negative." };
    if (orderDiscount > lineNet) return { ok: false, error: "Order discount can't be more than the order total." };

    let exchangeInfo: Order["exchange"];
    if (input.exchange) {
      const original = orders.find((o) => o.id === input.exchange!.originalOrderId);
      if (!original) return { ok: false, error: "The delivered order for this exchange could not be found." };
      if (original.status !== "delivered") return { ok: false, error: "Only a Delivered order can be exchanged." };
      if (original.exchange) return { ok: false, error: "An exchange order can't itself be exchanged — use the original delivered order." };
      const credit = Number(input.exchange.credit);
      if (!Number.isFinite(credit) || credit < 0) return { ok: false, error: "Exchange credit can't be negative." };
      exchangeInfo = { originalOrderId: original.id, originalOrderNumber: original.orderNumber, credit };
    }

    // Availability check against live product stock (stock - reserved).
    for (const line of input.items) {
      const product = products.find((p) => p.id === line.productId);
      const variant = product?.variants.find((v) => v.id === line.variantId);
      if (!variant) return { ok: false, error: `${line.productName} (${line.color}/${line.size}) is no longer available.` };
      const available = variant.stock - (variant.reserved ?? 0);
      if (line.qty > available) {
        return {
          ok: false,
          error: `Only ${available} left in stock for ${line.productName} (${line.color}/${line.size}).`,
        };
      }
    }

    // Numbers are reserved from the server ahead of time so two people never get the same one.
    const reserved = takeNumber("order");
    if (reserved === null) return { ok: false, error: "Still reserving the next order number — please try again in a moment." };

    const now = new Date().toISOString();
    const orderNumber = `${settings.invoice.numbering.order}${reserved}`;
    const order: Order = {
      id: crypto.randomUUID(),
      orderNumber,
      status: "pending",
      customerName: input.customerName,
      phone: input.phone,
      altPhone: input.altPhone,
      address: input.address,
      district: input.district,
      area: input.area,
      notes: input.notes,
      items: foldOrderDiscount(input.items, orderDiscount).map((i) => ({ ...i, id: crypto.randomUUID() })),
      deliveryCharge: input.deliveryCharge,
      ...(exchangeInfo ? { exchange: exchangeInfo } : {}),
      ...(input.pos ? { source: "pos" as const, posInvoiceId: input.pos.invoiceId, posInvoiceNumber: input.pos.invoiceNumber } : {}),
      courier: { company: "", trackingId: "", forwardCost: freeDeliveryCourierCost, returnCost: 0, otherCost: 0 },
      delivery: { customerPaid: 0 },
      returnInfo: { returnRequired: false, returnReceived: false },
      cancellation: {},
      activity: [
        activity(
          "Order Created",
          [
            input.pos ? `From POS invoice ${input.pos.invoiceNumber}` : null,
            exchangeInfo ? `Exchange for delivered order ${exchangeInfo.originalOrderNumber} · credit ৳${exchangeInfo.credit.toLocaleString()}` : null,
            orderDiscount > 0 ? `Order discount ৳${orderDiscount.toLocaleString()} applied` : null,
            freeDeliveryCourierCost > 0 ? `Free delivery — courier charge ৳${freeDeliveryCourierCost.toLocaleString()} counted as a loss` : null,
          ]
            .filter(Boolean)
            .join(" · ") || undefined
        ),
      ],
      createdAt: now,
      updatedAt: now,
    };

    // Normalize phone to English digits without dashes/spaces before saving
    try {
      const normalizePhone = (p: string) => {
        if (!p) return p;
        let s = String(p).trim();
        const banglaDigits: Record<string, string> = {
          "০": "0",
          "১": "1",
          "২": "2",
          "৩": "3",
          "৪": "4",
          "৫": "5",
          "৬": "6",
          "৭": "7",
          "৮": "8",
          "৯": "9",
        };
        for (const [bn, en] of Object.entries(banglaDigits)) {
          s = s.split(bn).join(en);
        }
        s = s.replace(/[-\s()\+\.\u2010-\u2015]/g, "");
        return s;
      };
      order.phone = normalizePhone(order.phone);
      if (order.altPhone) order.altPhone = normalizePhone(order.altPhone);
    } catch {}

    reserveStock(itemsAsLineItems(order.items));
    setOrders((prev) => [
      order,
      ...prev.map((o) =>
        exchangeInfo && o.id === exchangeInfo.originalOrderId
          ? {
              ...o,
              exchangedTo: [...(o.exchangedTo ?? []), { orderId: order.id, orderNumber }],
              activity: [...o.activity, activity("Exchange order created", `${orderNumber} · credit ৳${exchangeInfo.credit.toLocaleString()}`)],
              updatedAt: now,
            }
          : o
      ),
    ]);
    return { ok: true, order };
  }

  const discardOrder = (id: string) => setOrders((prev) => prev.filter((o) => o.id !== id));

  function updateOrder(id: string, updater: (o: Order) => Order) {
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...updater(o), updatedAt: new Date().toISOString() } : o)));
  }

  function markProcessing(id: string, courierInfo?: Partial<CourierInfo>) {
    const order = getOrder(id);
    if (!order || order.status !== "pending") return;
    updateOrder(id, (o) => ({
      ...o,
      status: "processing",
      courier: courierInfo ? { ...o.courier, ...courierInfo } : o.courier,
      activity: [
        ...o.activity,
        activity("Marked Processing", courierInfo?.trackingId ? `Steadfast Consignment ID: ${courierInfo.trackingId}` : undefined),
      ],
    }));
  }

  function recordSteadfastBooking(id: string, trackingId: string, companyName?: string) {
    const order = getOrder(id);
    if (!order || (order.status !== "pending" && order.status !== "processing")) return;
    const company = companyName || order.courier.company || "Steadfast";
    updateOrder(id, (o) => ({
      ...o,
      status: "processing",
      courier: { ...o.courier, company, trackingId },
      activity: [
        ...o.activity,
        ...(o.status === "pending" ? [activity("Marked Processing", `Steadfast Consignment ID: ${trackingId}`)] : []),
        ...(o.status === "processing" ? [activity("Steadfast consignment created", `Consignment ID: ${trackingId}; waiting for courier acceptance`)] : []),
      ],
    }));
  }

  function dispatchOrder(id: string, input: DispatchInput) {
    const order = getOrder(id);
    if (!order || order.status !== "processing") return;
    updateOrder(id, (o) => ({
      ...o,
      status: "in_transit",
      courier: { ...o.courier, company: input.company, trackingId: input.trackingId, dispatchDate: input.dispatchDate, forwardCost: input.forwardCost },
      activity: [...o.activity, activity(input.company ? `Dispatched via ${input.company}` : "Dispatched", input.trackingId ? `Tracking ${input.trackingId}` : undefined)],
    }));
  }

  function markDelivered(id: string, input: DeliveredInput) {
    const order = getOrder(id);
    if (!order || order.status !== "in_transit") return;
    consumeStock(itemsAsLineItems(order.items));
    // Section D2 — auto-create a warranty per delivered line item.
    createWarrantiesForOrder({
      id: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      phone: order.phone,
      items: order.items.map((i) => ({
        productId: i.productId,
        productName: i.productName,
        variantId: i.variantId,
        color: i.color,
        size: i.size,
        sku: i.sku,
        qty: i.qty,
      })),
    });
    // A Delivered exchange parcel takes the product value over from the original order, which then keeps only its delivery charge.
    if (order.exchange) {
      const { originalOrderId, credit } = order.exchange;
      setOrders((prev) =>
        prev.map((o) =>
          o.id === originalOrderId
            ? { ...o, exchangeMoved: credit, activity: [...o.activity, activity("Product value moved to exchange order", `${order.orderNumber} delivered · ৳${credit.toLocaleString()}`)], updatedAt: new Date().toISOString() }
            : o
        )
      );
    }
    updateOrder(id, (o) => ({
      ...o,
      status: "delivered",
      // The courier confirms its real delivery fee once it has the parcel — record it right here.
      courier: input.forwardCost === undefined ? o.courier : { ...o.courier, forwardCost: input.forwardCost },
      delivery: { customerPaid: input.customerPaid, deliveryDate: input.deliveryDate, settlementStatus: input.settlementStatus },
      activity: [
        ...o.activity,
        activity("Marked Delivered", `Collected ৳${input.customerPaid.toLocaleString()}`),
        ...(input.forwardCost !== undefined && input.forwardCost !== o.courier.forwardCost
          ? [activity("Courier delivery charge updated", `৳${o.courier.forwardCost} → ৳${input.forwardCost}`)]
          : []),
      ],
    }));
  }

  function markPartialDelivered(id: string, input: PartialInput) {
    const order = getOrder(id);
    if (!order || order.status !== "in_transit") return;
    const requestedKept = new Map(input.itemsKept.map((i) => [i.itemId, i.qty]));
    const keptById = new Map(order.items.map((i) => [i.id, Math.min(i.qty, Math.max(0, requestedKept.get(i.id) ?? 0))]));
    const kept = order.items.map((i) => ({ productId: i.productId, variantId: i.variantId, qty: keptById.get(i.id) ?? 0 })).filter((i) => i.qty > 0);
    const returned = order.items.map((i) => ({ productId: i.productId, variantId: i.variantId, qty: i.qty - (keptById.get(i.id) ?? 0) })).filter((i) => i.qty > 0);
    if (kept.reduce((sum, i) => sum + i.qty, 0) === 0 || returned.reduce((sum, i) => sum + i.qty, 0) === 0) return;
    consumeStock(kept);
    // Returned units remain reserved until physically back; auto-receive only releases that remainder.
    if (autoReceiveReturns) releaseStock(returned);
    updateOrder(id, (o) => ({
      ...o,
      status: "partial_delivered",
      courier: { ...o.courier, forwardCost: input.forwardCost ?? o.courier.forwardCost, returnCost: input.returnCost, otherCost: input.otherCost },
      delivery: { ...o.delivery, customerPaid: input.customerPaid, itemsKept: order.items.map((i) => ({ itemId: i.id, qty: keptById.get(i.id) ?? 0 })) },
      returnInfo: autoReceiveReturns ? { returnRequired: true, returnReceived: true, returnDate: new Date().toISOString() } : { returnRequired: true, returnReceived: false },
      activity: [
        ...o.activity,
        activity("Marked Partial Delivered", input.reason ? `Reason: ${input.reason}` : undefined),
        ...(input.forwardCost !== undefined && input.forwardCost !== order.courier.forwardCost
          ? [activity("Courier delivery charge updated", `৳${order.courier.forwardCost} → ৳${input.forwardCost}`)]
          : []),
        ...(autoReceiveReturns ? [activity("Return Received", "Stock restored automatically (return confirmation not required)")] : []),
      ],
    }));
  }

  function markRefuseReturn(id: string, input: RefuseInput) {
    const order = getOrder(id);
    if (!order || order.status !== "in_transit") return;
    // Stock stays reserved ("Returning") until the parcel is physically back — unless Settings say a return confirmation isn't needed.
    if (autoReceiveReturns) releaseStock(itemsAsLineItems(order.items));
    updateOrder(id, (o) => ({
      ...o,
      status: "refuse_return",
      courier: { ...o.courier, forwardCost: input.forwardCost ?? o.courier.forwardCost, returnCost: input.returnCost, otherCost: input.otherCost },
      delivery: { ...o.delivery, customerPaid: 0 },
      returnInfo: autoReceiveReturns ? { returnRequired: true, returnReceived: true, returnDate: new Date().toISOString() } : { returnRequired: true, returnReceived: false },
      activity: [
        ...o.activity,
        activity("Marked Refuse Return"),
        ...(input.forwardCost !== undefined && input.forwardCost !== order.courier.forwardCost
          ? [activity("Courier delivery charge updated", `৳${order.courier.forwardCost} → ৳${input.forwardCost}`)]
          : []),
        ...(autoReceiveReturns ? [activity("Return Received", "Stock restored automatically (return confirmation not required)")] : []),
      ],
    }));
  }

  function markReturnReceived(id: string) {
    const order = getOrder(id);
    if (!order) return;
    if (order.status !== "partial_delivered" && order.status !== "refuse_return") return;
    if (!order.returnInfo.returnRequired || order.returnInfo.returnReceived) return;
    const releaseItems = order.status === "partial_delivered" && order.delivery.itemsKept
      ? order.items.map((i) => ({ productId: i.productId, variantId: i.variantId, qty: Math.max(0, i.qty - (order.delivery.itemsKept?.find((x) => x.itemId === i.id)?.qty ?? 0)) })).filter((i) => i.qty > 0)
      : itemsAsLineItems(order.items);
    releaseStock(releaseItems);
    const now = new Date().toISOString();
    updateOrder(id, (o) => ({
      ...o,
      returnInfo: { ...o.returnInfo, returnReceived: true, returnDate: now },
      activity: [...o.activity, activity("Return Received", "Stock restored")],
    }));
  }

  function cancelOrder(id: string, input: CancelInput): { ok: true } | { ok: false; error: string } {
    const order = getOrder(id);
    if (!order) return { ok: false, error: "Order not found." };
    if (!canCancelOrder(order.status)) {
      return { ok: false, error: "This order can no longer be cancelled — it has already reached the courier." };
    }
    releaseStock(itemsAsLineItems(order.items));
    const now = new Date().toISOString();
    updateOrder(id, (o) => ({
      ...o,
      status: "cancelled",
      cancellation: { cancelledAt: now, cancelledBy: input.cancelledBy ?? "You", reason: input.reason, notes: input.notes },
      activity: [...o.activity, activity("Cancelled", cancelReasonLabel(input.reason))],
    }));
    return { ok: true };
  }

  function updateCourierCharges(id: string, input: CourierChargesInput): { ok: true } | { ok: false; error: string } {
    const order = getOrder(id);
    if (!order) return { ok: false, error: "Order not found." };
    if (order.status === "cancelled") return { ok: false, error: "A cancelled order never shipped — it has no courier charges." };
    if (!order.courier.company && !order.courier.trackingId) return { ok: false, error: "This order hasn't been dispatched yet — set the charge on the dispatch form." };
    if ([input.forwardCost, input.returnCost, input.otherCost].some((n) => !Number.isFinite(n) || n < 0)) {
      return { ok: false, error: "Courier charges can't be negative." };
    }
    const line = (f: number, r: number, o: number) => `Delivery ৳${f} · Return ৳${r} · Other ৳${o}`;
    updateOrder(id, (o) => ({
      ...o,
      courier: { ...o.courier, forwardCost: input.forwardCost, returnCost: input.returnCost, otherCost: input.otherCost },
      activity: [...o.activity, activity("Courier charges updated", `${line(o.courier.forwardCost, o.courier.returnCost, o.courier.otherCost)} → ${line(input.forwardCost, input.returnCost, input.otherCost)}`)],
    }));
    return { ok: true };
  }

  function updateCustomerPaid(id: string, amount: number): { ok: true } | { ok: false; error: string } {
    const order = getOrder(id);
    if (!order) return { ok: false, error: "Order not found." };
    if (order.status !== "delivered" && order.status !== "partial_delivered") {
      return { ok: false, error: "Customer Paid can only be changed on delivered or partial delivered orders." };
    }
    if (!Number.isFinite(amount) || amount < 0) return { ok: false, error: "Customer Paid cannot be negative." };
    if (amount === order.delivery.customerPaid) return { ok: true };
    updateOrder(id, (o) => ({
      ...o,
      delivery: { ...o.delivery, customerPaid: amount },
      activity: [...o.activity, activity("Customer Paid updated", `৳${o.delivery.customerPaid.toLocaleString()} → ৳${amount.toLocaleString()}`)],
    }));
    return { ok: true };
  }

  function exchangeDeliveredOrder(id: string, returned: { itemId: string; qty: number }[], given: Omit<OrderItem, "id">[]): { ok: true; exchange: OrderExchange } | { ok: false; error: string } {
    const order = getOrder(id);
    if (!order || order.status !== "delivered") return { ok: false, error: "Exchanges are available for delivered orders." };
    if (!returned.length || !given.length || returned.some((x) => !Number.isInteger(x.qty) || x.qty < 1) || given.some((x) => !Number.isInteger(x.qty) || x.qty < 1)) return { ok: false, error: "Choose returned and replacement products with whole quantities." };
    const returnedQty = new Map<string, number>();
    for (const ex of order.exchanges ?? []) for (const item of ex.returned) returnedQty.set(item.itemId, (returnedQty.get(item.itemId) ?? 0) + item.qty);
    const requestedReturned = new Map<string, number>();
    const returnedLines: OrderExchange["returned"] = [];
    for (const line of returned) {
      const original = order.items.find((i) => i.id === line.itemId);
      const totalReturned = (requestedReturned.get(line.itemId) ?? 0) + line.qty;
      if (!original || totalReturned > original.qty - (returnedQty.get(line.itemId) ?? 0)) return { ok: false, error: "Returned quantity exceeds the unexchanged quantity on this order." };
      requestedReturned.set(line.itemId, totalReturned);
      const product = products.find((p) => p.id === original.productId);
      const variant = product?.variants.find((v) => v.id === original.variantId);
      if (!variant) return { ok: false, error: `${original.productName} is no longer in the catalogue.` };
      returnedLines.push({ itemId: line.itemId, qty: line.qty, unitValue: Math.max(0, original.price - original.discount / original.qty) });
    }
    const givenLines: OrderExchange["given"] = [];
    const requestedGiven = new Map<string, number>();
    for (const line of given) {
      const product = products.find((p) => p.id === line.productId);
      const variant = product?.variants.find((v) => v.id === line.variantId);
      if (!variant) return { ok: false, error: `${line.productName} (${line.color}/${line.size}) is no longer available.` };
      const key = `${line.productId}:${line.variantId}`;
      const demand = (requestedGiven.get(key) ?? 0) + line.qty;
      const available = variant.stock - (variant.reserved ?? 0) + returnedLines.filter((r) => { const source = order.items.find((i) => i.id === r.itemId); return source?.productId === line.productId && source.variantId === variant.id; }).reduce((n, r) => n + r.qty, 0);
      if (demand > available) return { ok: false, error: `Only ${Math.max(0, available)} available for ${line.productName} (${line.color}/${line.size}).` };
      requestedGiven.set(key, demand);
      if (!Number.isFinite(line.price) || line.price < 0 || !Number.isFinite(line.discount) || line.discount < 0 || line.discount > line.price * line.qty) return { ok: false, error: "Replacement prices or discounts are invalid." };
      givenLines.push({ ...line, id: crypto.randomUUID() });
    }
    const roundMoney = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
    const returnedValue = roundMoney(returnedLines.reduce((sum, i) => sum + i.unitValue * i.qty, 0));
    const givenValue = roundMoney(givenLines.reduce((sum, i) => sum + i.price * i.qty - i.discount, 0));
    const exchange: OrderExchange = { id: crypto.randomUUID(), at: new Date().toISOString(), returned: returnedLines, given: givenLines, returnedValue, givenValue, cashDifference: roundMoney(givenValue - returnedValue), by: runtime.actor.name };
    restoreStock(returnedLines.map((r) => { const i = order.items.find((x) => x.id === r.itemId)!; return { productId: i.productId, variantId: i.variantId, qty: r.qty }; }));
    sellStock(givenLines.map((i) => ({ productId: i.productId, variantId: i.variantId, qty: i.qty })));
    updateOrder(id, (o) => ({ ...o, exchanges: [...(o.exchanges ?? []), exchange], activity: [...o.activity, activity("Order exchange", `Returned ৳${returnedValue.toLocaleString()} · replacement ৳${givenValue.toLocaleString()} · ${exchange.cashDifference >= 0 ? `collected ৳${exchange.cashDifference.toLocaleString()}` : `refunded ৳${Math.abs(exchange.cashDifference).toLocaleString()}`}`)] }));
    return { ok: true, exchange };
  }

  function editOrder(id: string, input: EditOrderInput): { ok: true } | { ok: false; error: string } {
    const order = getOrder(id);
    if (!order) return { ok: false, error: "Order not found." };
    if (!input.items.length) return { ok: false, error: "An order needs at least one product." };
    if (input.items.some((i) => i.qty < 1)) return { ok: false, error: "Every product needs a quantity of at least 1." };
    if (input.status === "partial_delivered") {
      const kept = new Map((input.delivery.itemsKept ?? []).map((x) => [x.itemId, x.qty]));
      if (input.items.some((i) => !Number.isInteger(kept.get(i.id) ?? 0) || (kept.get(i.id) ?? 0) < 0 || (kept.get(i.id) ?? 0) > i.qty)) return { ok: false, error: "Kept quantities must be whole numbers between zero and the shipped quantity." };
      const keptTotal = input.items.reduce((sum, i) => sum + (kept.get(i.id) ?? 0), 0);
      const total = input.items.reduce((sum, i) => sum + i.qty, 0);
      if (keptTotal <= 0 || keptTotal >= total) return { ok: false, error: "A partial delivery needs at least one item kept and at least one item returning." };
    }

    const now = new Date().toISOString();
    const isReturnStatus = input.status === "partial_delivered" || input.status === "refuse_return";
    const isDeliveryStatus = input.status === "delivered" || isReturnStatus;

    // Normalise the status-dependent blocks so the saved order is always internally consistent.
    const returnReceived = isReturnStatus && input.returnInfo.returnReceived;
    const returnInfo: ReturnInfo = isReturnStatus
      ? {
          returnRequired: true,
          returnReceived,
          returnDate: returnReceived ? order.returnInfo.returnDate ?? input.returnInfo.returnDate ?? now : undefined,
        }
      : { returnRequired: false, returnReceived: false };

    const delivery: DeliveryResult = !isDeliveryStatus
      ? { customerPaid: 0 }
      : input.status === "refuse_return"
        ? { customerPaid: 0 }
        : input.delivery;

    const cancellation: CancellationInfo =
      input.status === "cancelled"
        ? {
            cancelledAt: order.cancellation.cancelledAt ?? now,
            cancelledBy: order.cancellation.cancelledBy ?? "Super Admin",
            reason: input.cancellation.reason ?? "other",
            notes: input.cancellation.notes,
          }
        : {};

    const next: Order = {
      ...order,
      status: input.status,
      customerName: input.customerName,
      phone: input.phone,
      altPhone: input.altPhone,
      address: input.address,
      district: input.district,
      area: input.area,
      notes: input.notes,
      items: input.items,
      deliveryCharge: input.deliveryCharge,
      courier: input.courier,
      delivery,
      returnInfo,
      cancellation,
    };

    const oldStock = stockBuckets(order);
    const newStock = stockBuckets(next);

    // Availability check for demand that is genuinely new (what this order already holds is credited back).
    if (newStock.reserved.length || newStock.consumed.length) {
      const heldBefore = new Map<string, number>();
      for (const i of [...oldStock.reserved, ...oldStock.consumed]) heldBefore.set(i.variantId, (heldBefore.get(i.variantId) ?? 0) + i.qty);
      const wanted = new Map<string, { qty: number; label: string; productId: string }>();
      for (const i of [...newStock.reserved, ...newStock.consumed]) {
        const cur = wanted.get(i.variantId);
        const product = products.find((p) => p.id === i.productId);
        const variant = product?.variants.find((v) => v.id === i.variantId);
        wanted.set(i.variantId, {
          qty: (cur?.qty ?? 0) + i.qty,
          label: `${product?.name ?? i.productId} (${variant?.color ?? "?"}/${variant?.size ?? "?"})`,
          productId: i.productId,
        });
      }
      for (const [variantId, w] of wanted) {
        const variant = products.find((p) => p.id === w.productId)?.variants.find((v) => v.id === variantId);
        const alreadyHeld = heldBefore.get(variantId) ?? 0;
        if (!variant) {
          if (alreadyHeld === 0) return { ok: false, error: `${w.label} is no longer available.` };
          continue; // variant was removed from the catalogue; nothing to reconcile
        }
        const availableAfterCredit = variant.stock - (variant.reserved ?? 0) + alreadyHeld;
        if (w.qty > availableAfterCredit) {
          return { ok: false, error: `Only ${Math.max(0, availableAfterCredit)} available for ${w.label}.` };
        }
      }
    }

    // Restore the old stock effects, then apply the new composition. This handles partial orders
    // which simultaneously contain customer-kept (consumed) and returning (reserved) quantities.
    if (oldStock.reserved.length) releaseStock(oldStock.reserved);
    if (oldStock.consumed.length) restoreStock(oldStock.consumed);
    if (newStock.reserved.length) reserveStock(newStock.reserved);
    if (newStock.consumed.length) { reserveStock(newStock.consumed); consumeStock(newStock.consumed); }

    // Warranty reconciliation (warranties exist only for delivered orders).
    const wasDelivered = order.status === "delivered";
    const isDelivered = next.status === "delivered";
    const warrantyReason = "Order edited by Super Admin";
    const toWarrantyItem = (i: OrderItem) => ({
      productId: i.productId,
      productName: i.productName,
      variantId: i.variantId,
      color: i.color,
      size: i.size,
      sku: i.sku,
      qty: i.qty,
    });
    const warrantyHeader = {
      id: order.id,
      orderNumber: order.orderNumber,
      customerName: next.customerName,
      phone: next.phone,
    };
    if (!wasDelivered && isDelivered) {
      createWarrantiesForOrder({ ...warrantyHeader, items: next.items.map(toWarrantyItem) });
    } else if (wasDelivered && !isDelivered) {
      for (const i of order.items) voidWarrantiesForOrderItem(order.id, i.variantId, warrantyReason);
    } else if (wasDelivered && isDelivered) {
      const oldVariants = new Set(order.items.map((i) => i.variantId));
      const newVariants = new Set(next.items.map((i) => i.variantId));
      for (const i of order.items) {
        if (!newVariants.has(i.variantId)) voidWarrantiesForOrderItem(order.id, i.variantId, warrantyReason);
      }
      const added = next.items.filter((i) => !oldVariants.has(i.variantId));
      if (added.length) createWarrantiesForOrder({ ...warrantyHeader, items: added.map(toWarrantyItem) });
    }

    const changes = describeOrderChanges(order, next);
    setOrders((prev) =>
      prev.map((o) =>
        o.id === id
          ? {
              ...next,
              updatedAt: now,
              activity: [
                ...o.activity,
                activity("Edited by Super Admin", changes.length ? changes.join(" · ") : "No field changes"),
              ],
            }
          : o
      )
    );
    return { ok: true };
  }

  function setSettlementFlags(flags: Record<string, SettlementStatus>) {
    setOrders((prev) => {
      let changed = false;
      const next = prev.map((o) => {
        const flag = flags[o.id];
        if (!flag || o.delivery.settlementStatus === flag) return o;
        changed = true;
        return { ...o, delivery: { ...o.delivery, settlementStatus: flag } };
      });
      return changed ? next : prev;
    });
  }

  function deleteOrder(id: string): { ok: true } | { ok: false; error: string } {
    const order = getOrder(id);
    if (!order) return { ok: false, error: "Order not found." };
    const stock = stockBuckets(order);
    if (stock.reserved.length) releaseStock(stock.reserved);
    if (stock.consumed.length) restoreStock(stock.consumed);
    if (order.status === "delivered") {
      for (const i of order.items) voidWarrantiesForOrderItem(order.id, i.variantId, "Order deleted by Super Admin");
    }
    setOrders((prev) => prev.filter((o) => o.id !== id));
    return { ok: true };
  }

  const value = useMemo<OrdersContextValue>(
    () => ({
      orders,
      hydrated,
      getOrder,
      statusCounts,
      createOrder,
      markProcessing,
      recordSteadfastBooking,
      dispatchOrder,
      markDelivered,
      markPartialDelivered,
      markRefuseReturn,
      markReturnReceived,
      updateCourierCharges,
      updateCustomerPaid,
      exchangeDeliveredOrder,
      cancelOrder,
      editOrder,
      deleteOrder,
      discardOrder,
      setSettlementFlags,
    }),
    // `products` is included so stock-availability checks (create/edit) never run against a stale catalogue.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orders, hydrated, statusCounts, products]
  );

  return <OrdersContext.Provider value={value}>{children}</OrdersContext.Provider>;
}

export function useOrders() {
  const ctx = useContext(OrdersContext);
  if (!ctx) throw new Error("useOrders must be used within an OrdersProvider");
  return ctx;
}
