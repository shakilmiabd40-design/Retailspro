"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useProducts } from "@/lib/products/store";
import type { StockLineItem } from "@/lib/products/store";
import { useWarranty } from "@/lib/warranty/store";
import { runtime } from "@/lib/settings/runtime";
import { useSettings } from "@/lib/settings/store";
import { useCollection } from "@/lib/persist/hooks";
import { takeNumber } from "@/lib/persist/numbers";
import { cancelReasonLabel, canCancelOrder, describeOrderChanges, foldOrderDiscount, stockEffectFor } from "./utils";
import type {
  CancelReason,
  CancellationInfo,
  CourierInfo,
  DeliveryResult,
  Order,
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
};

export type PartialInput = {
  customerPaid: number;
  returnCost: number;
  otherCost: number;
  reason?: string;
};

export type RefuseInput = {
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

function activity(label: string, detail?: string) {
  return { id: crypto.randomUUID(), at: new Date().toISOString(), label, detail, by: runtime.actor.name };
}

interface OrdersContextValue {
  orders: Order[];
  hydrated: boolean;
  getOrder: (id: string) => Order | undefined;
  statusCounts: Record<OrderStatus | "all", number>;
  createOrder: (input: NewOrderInput) => { ok: true; order: Order } | { ok: false; error: string };
  markProcessing: (id: string) => void;
  dispatchOrder: (id: string, input: DispatchInput) => void;
  markDelivered: (id: string, input: DeliveredInput) => void;
  markPartialDelivered: (id: string, input: PartialInput) => void;
  markRefuseReturn: (id: string, input: RefuseInput) => void;
  markReturnReceived: (id: string) => void;
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
  const { reserveStock, releaseStock, consumeStock, restoreStock, products } = useProducts();
  const { createWarrantiesForOrder, voidWarrantiesForOrderItem } = useWarranty();
  const { settings } = useSettings();
  // Settings → Orders: when "Return Received" isn't mandatory, stock is released the moment the outcome is recorded.
  const autoReceiveReturns = !settings.orders.returnReceivedMandatory;
  const [orders, setOrders, hydrated] = useCollection<Order>("orders");

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

    reserveStock(itemsAsLineItems(order.items));
    setOrders((prev) => [order, ...prev]);
    return { ok: true, order };
  }

  const discardOrder = (id: string) => setOrders((prev) => prev.filter((o) => o.id !== id));

  function updateOrder(id: string, updater: (o: Order) => Order) {
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...updater(o), updatedAt: new Date().toISOString() } : o)));
  }

  function markProcessing(id: string) {
    const order = getOrder(id);
    if (!order || order.status !== "pending") return;
    updateOrder(id, (o) => ({ ...o, status: "processing", activity: [...o.activity, activity("Marked Processing")] }));
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
    updateOrder(id, (o) => ({
      ...o,
      status: "delivered",
      delivery: { customerPaid: input.customerPaid, deliveryDate: input.deliveryDate, settlementStatus: input.settlementStatus },
      activity: [...o.activity, activity("Marked Delivered", `Collected ৳${input.customerPaid.toLocaleString()}`)],
    }));
  }

  function markPartialDelivered(id: string, input: PartialInput) {
    const order = getOrder(id);
    if (!order || order.status !== "in_transit") return;
    // Stock stays reserved ("Returning") until the parcel is physically back — unless Settings say a return confirmation isn't needed.
    if (autoReceiveReturns) releaseStock(itemsAsLineItems(order.items));
    updateOrder(id, (o) => ({
      ...o,
      status: "partial_delivered",
      courier: { ...o.courier, returnCost: input.returnCost, otherCost: input.otherCost },
      delivery: { ...o.delivery, customerPaid: input.customerPaid },
      returnInfo: autoReceiveReturns ? { returnRequired: true, returnReceived: true, returnDate: new Date().toISOString() } : { returnRequired: true, returnReceived: false },
      activity: [
        ...o.activity,
        activity("Marked Partial Delivered", input.reason ? `Reason: ${input.reason}` : undefined),
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
      courier: { ...o.courier, returnCost: input.returnCost, otherCost: input.otherCost },
      delivery: { ...o.delivery, customerPaid: 0 },
      returnInfo: autoReceiveReturns ? { returnRequired: true, returnReceived: true, returnDate: new Date().toISOString() } : { returnRequired: true, returnReceived: false },
      activity: [
        ...o.activity,
        activity("Marked Refuse Return"),
        ...(autoReceiveReturns ? [activity("Return Received", "Stock restored automatically (return confirmation not required)")] : []),
      ],
    }));
  }

  function markReturnReceived(id: string) {
    const order = getOrder(id);
    if (!order) return;
    if (order.status !== "partial_delivered" && order.status !== "refuse_return") return;
    if (!order.returnInfo.returnRequired || order.returnInfo.returnReceived) return;
    releaseStock(itemsAsLineItems(order.items));
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

  function editOrder(id: string, input: EditOrderInput): { ok: true } | { ok: false; error: string } {
    const order = getOrder(id);
    if (!order) return { ok: false, error: "Order not found." };
    if (!input.items.length) return { ok: false, error: "An order needs at least one product." };
    if (input.items.some((i) => i.qty < 1)) return { ok: false, error: "Every product needs a quantity of at least 1." };

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

    const oldEffect = stockEffectFor(order);
    const newEffect = stockEffectFor(next);

    // Availability check for demand that is genuinely new (what this order already holds is credited back).
    if (newEffect !== "none") {
      const heldBefore = new Map<string, number>();
      if (oldEffect !== "none") {
        for (const i of order.items) heldBefore.set(i.variantId, (heldBefore.get(i.variantId) ?? 0) + i.qty);
      }
      const wanted = new Map<string, { qty: number; label: string; productId: string }>();
      for (const i of next.items) {
        const cur = wanted.get(i.variantId);
        wanted.set(i.variantId, {
          qty: (cur?.qty ?? 0) + i.qty,
          label: `${i.productName} (${i.color}/${i.size})`,
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

    // Stock reconciliation.
    const key = (i: { productId: string; variantId: string }) => `${i.productId}:${i.variantId}`;
    if (oldEffect === newEffect && oldEffect !== "none") {
      // Same kind of hold before and after — only move the per-variant difference.
      const oldQty = new Map<string, number>();
      const newQty = new Map<string, number>();
      const meta = new Map<string, { productId: string; variantId: string }>();
      for (const i of order.items) {
        oldQty.set(key(i), (oldQty.get(key(i)) ?? 0) + i.qty);
        meta.set(key(i), i);
      }
      for (const i of next.items) {
        newQty.set(key(i), (newQty.get(key(i)) ?? 0) + i.qty);
        meta.set(key(i), i);
      }
      const plus: StockLineItem[] = [];
      const minus: StockLineItem[] = [];
      for (const [k, m] of meta) {
        const diff = (newQty.get(k) ?? 0) - (oldQty.get(k) ?? 0);
        if (diff > 0) plus.push({ productId: m.productId, variantId: m.variantId, qty: diff });
        if (diff < 0) minus.push({ productId: m.productId, variantId: m.variantId, qty: -diff });
      }
      if (oldEffect === "reserved") {
        if (plus.length) reserveStock(plus);
        if (minus.length) releaseStock(minus);
      } else {
        if (plus.length) {
          reserveStock(plus);
          consumeStock(plus);
        }
        if (minus.length) restoreStock(minus);
      }
    } else {
      if (oldEffect === "reserved") releaseStock(itemsAsLineItems(order.items));
      if (oldEffect === "consumed") restoreStock(itemsAsLineItems(order.items));
      if (newEffect === "reserved") reserveStock(itemsAsLineItems(next.items));
      if (newEffect === "consumed") {
        reserveStock(itemsAsLineItems(next.items));
        consumeStock(itemsAsLineItems(next.items));
      }
    }

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
    const effect = stockEffectFor(order);
    if (effect === "reserved") releaseStock(itemsAsLineItems(order.items));
    if (effect === "consumed") restoreStock(itemsAsLineItems(order.items));
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
      dispatchOrder,
      markDelivered,
      markPartialDelivered,
      markRefuseReturn,
      markReturnReceived,
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
