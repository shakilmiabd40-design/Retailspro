import "server-only";
import { ApiError } from "./http";
import type { Order, OrderStatus } from "@/lib/orders/types";
import type { Product } from "@/lib/products/types";

/**
 * Server-side invariant checks for the records the dashboard's sync API stores.
 *
 * The app's business rules run in the browser, so the sync endpoint used to accept any well-shaped JSON a
 * client sent. These validators re-check the invariants that NO legitimate screen ever violates, so a
 * tampered or buggy client can't persist values that would silently corrupt stock and money maths
 * (negative stock/price, a line discount larger than the line, an unknown status…).
 *
 * Deliberately conservative: every field is only checked when it is present, and only clearly-invalid
 * values are rejected. Derived totals (Expected COD, revenue, courier profit/loss) are recomputed from
 * these inputs everywhere, so guarding the inputs is enough. Status *transitions* are NOT enforced here —
 * Super Admin `editOrder` may legitimately set any status, and restore/seed write arbitrary statuses.
 */

const ORDER_STATUSES: readonly OrderStatus[] = [
  "pending",
  "processing",
  "in_transit",
  "delivered",
  "partial_delivered",
  "refuse_return",
  "cancelled",
];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Small slack so pro-rata discount rounding (foldOrderDiscount) never trips the line-total check. */
const EPSILON = 0.01;

function invalid(field: string, message: string): never {
  throw new ApiError(422, "invalid_field", message, { field });
}

/** Rejects a present value that isn't a finite number ≥ 0. Absent (undefined/null) values are allowed. */
function nonNegative(value: unknown, field: string): void {
  if (value === undefined || value === null) return;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    invalid(field, `${field} must be a number of 0 or more.`);
  }
}

/** Rejects a present value that isn't a finite whole number ≥ 1. */
function positiveInt(value: unknown, field: string): void {
  if (value === undefined || value === null) return;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    invalid(field, `${field} must be a whole number of 1 or more.`);
  }
}

export function validateOrder(data: unknown): void {
  if (!isObj(data)) invalid("order", "The order record must be an object.");
  const o = data as Partial<Order> & { orderDiscount?: unknown };

  if (o.status !== undefined && !ORDER_STATUSES.includes(o.status as OrderStatus)) {
    invalid("status", `Unknown order status "${String(o.status)}".`);
  }

  nonNegative(o.deliveryCharge, "deliveryCharge");
  nonNegative(o.orderDiscount, "orderDiscount");

  if (isObj(o.courier)) {
    nonNegative(o.courier.forwardCost, "courier.forwardCost");
    nonNegative(o.courier.returnCost, "courier.returnCost");
    nonNegative(o.courier.otherCost, "courier.otherCost");
  }
  if (isObj(o.delivery)) nonNegative(o.delivery.customerPaid, "delivery.customerPaid");

  if (o.items !== undefined) {
    if (!Array.isArray(o.items)) invalid("items", "items must be an array.");
    o.items.forEach((raw, idx) => {
      if (!isObj(raw)) invalid(`items[${idx}]`, `items[${idx}] must be an object.`);
      const field = (k: string) => `items[${idx}].${k}`;
      positiveInt(raw.qty, field("qty"));
      nonNegative(raw.price, field("price"));
      nonNegative(raw.discount, field("discount"));
      const { price, qty, discount } = raw as { price?: unknown; qty?: unknown; discount?: unknown };
      if (typeof price === "number" && typeof qty === "number" && typeof discount === "number") {
        if (discount > price * qty + EPSILON) {
          invalid(field("discount"), `items[${idx}].discount can't be more than the line total.`);
        }
      }
    });
  }
  if (o.exchange !== undefined) {
    // An exchange order (a replacement parcel raised against a delivered order): where it came from + the credit for the returned goods.
    if (!isObj(o.exchange) || typeof o.exchange.originalOrderId !== "string" || !o.exchange.originalOrderId || typeof o.exchange.originalOrderNumber !== "string") {
      invalid("exchange", "exchange must reference the delivered order it replaces.");
    }
    nonNegative(o.exchange.credit, "exchange.credit");
  }
  if (o.exchanges !== undefined) {
    if (!Array.isArray(o.exchanges)) invalid("exchanges", "exchanges must be an array.");
    if (o.exchanges.length && o.status !== "delivered") invalid("exchanges", "Only delivered orders can have exchanges.");
    const itemLimits = new Map((Array.isArray(o.items) ? o.items : []).map((item) => [item.id, item.qty] as const));
    const exchangedQty = new Map<string, number>();
    for (const [idx, raw] of o.exchanges.entries()) {
      if (!isObj(raw) || typeof raw.id !== "string" || typeof raw.at !== "string" || typeof raw.by !== "string" || !Array.isArray(raw.returned) || !raw.returned.length || !Array.isArray(raw.given) || !raw.given.length) invalid(`exchanges[${idx}]`, `exchanges[${idx}] is invalid.`);
      let returnedValue = 0;
      for (const returned of raw.returned) {
        if (!isObj(returned) || typeof returned.itemId !== "string" || !itemLimits.has(returned.itemId) || typeof returned.qty !== "number" || typeof returned.unitValue !== "number" || !Number.isFinite(returned.unitValue)) invalid(`exchanges[${idx}].returned`, "An exchanged returned item must refer to an order line and include valid quantities and values.");
        positiveInt(returned.qty, `exchanges[${idx}].returned.qty`);
        nonNegative(returned.unitValue, `exchanges[${idx}].returned.unitValue`);
        const qty = Number(returned.qty);
        const total = (exchangedQty.get(returned.itemId) ?? 0) + qty;
        if (total > (itemLimits.get(returned.itemId) ?? 0)) invalid(`exchanges[${idx}].returned.qty`, "Exchanged quantity cannot exceed the delivered quantity.");
        exchangedQty.set(returned.itemId, total);
        returnedValue += Number(returned.unitValue) * qty;
      }
      let givenValue = 0;
      for (const given of raw.given) {
        if (!isObj(given) || typeof given.qty !== "number" || typeof given.price !== "number" || typeof given.discount !== "number" || !Number.isFinite(given.price) || !Number.isFinite(given.discount)) invalid(`exchanges[${idx}].given`, "Replacement item is invalid.");
        positiveInt(given.qty, `exchanges[${idx}].given.qty`);
        nonNegative(given.price, `exchanges[${idx}].given.price`);
        nonNegative(given.discount, `exchanges[${idx}].given.discount`);
        if (Number(given.discount) > Number(given.price) * Number(given.qty) + EPSILON) invalid(`exchanges[${idx}].given.discount`, "Replacement discount cannot exceed its line total.");
        givenValue += Number(given.price) * Number(given.qty) - Number(given.discount);
      }
      if (typeof raw.returnedValue !== "number" || typeof raw.givenValue !== "number" || !Number.isFinite(raw.returnedValue) || !Number.isFinite(raw.givenValue)) invalid(`exchanges[${idx}]`, "Exchange totals must be valid amounts.");
      nonNegative(raw.returnedValue, `exchanges[${idx}].returnedValue`);
      nonNegative(raw.givenValue, `exchanges[${idx}].givenValue`);
      if (typeof raw.cashDifference !== "number" || !Number.isFinite(raw.cashDifference) || Math.abs(raw.cashDifference - (givenValue - returnedValue)) > EPSILON || Math.abs(raw.returnedValue - returnedValue) > EPSILON || Math.abs(raw.givenValue - givenValue) > EPSILON) invalid(`exchanges[${idx}].cashDifference`, "Exchange values and cash difference do not balance.");
    }
  }
}

export function validateProduct(data: unknown): void {
  if (!isObj(data)) invalid("product", "The product record must be an object.");
  const p = data as Partial<Product>;

  nonNegative(p.costPrice, "costPrice");
  nonNegative(p.sellingPrice, "sellingPrice");
  nonNegative(p.discountPrice, "discountPrice");

  if (p.variants !== undefined) {
    if (!Array.isArray(p.variants)) invalid("variants", "variants must be an array.");
    p.variants.forEach((raw, idx) => {
      if (!isObj(raw)) invalid(`variants[${idx}]`, `variants[${idx}] must be an object.`);
      const field = (k: string) => `variants[${idx}].${k}`;
      nonNegative(raw.cost, field("cost"));
      nonNegative(raw.price, field("price"));
      nonNegative(raw.stock, field("stock"));
      nonNegative(raw.reserved, field("reserved"));
    });
  }
}
