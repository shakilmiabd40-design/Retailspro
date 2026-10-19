import type { Order, OrderItem } from "./types";
import { SEED_PRODUCTS } from "../products/seed-data";

function findVariant(sku: string) {
  for (const p of SEED_PRODUCTS) {
    const v = p.variants.find((v) => v.sku === sku);
    if (v) return { product: p, variant: v };
  }
  throw new Error(`Seed variant not found: ${sku}`);
}

function line(sku: string, qty: number, discount = 0): OrderItem {
  const { product, variant } = findVariant(sku);
  return {
    id: crypto.randomUUID(),
    productId: product.id,
    productName: product.name,
    variantId: variant.id,
    color: variant.color,
    size: variant.size,
    sku: variant.sku,
    price: variant.price,
    qty,
    discount,
  };
}

/** Mirrors a still-active reservation (Pending/Processing/In Transit/Returning) onto the seeded product stock. */
function reserve(sku: string, qty: number) {
  const { variant } = findVariant(sku);
  variant.reserved = (variant.reserved ?? 0) + qty;
}

/** Mirrors a permanent sale (Delivered) onto the seeded product stock. */
function consume(sku: string, qty: number) {
  const { variant } = findVariant(sku);
  variant.stock = Math.max(0, variant.stock - qty);
}

function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 60 * 60 * 1000).toISOString();
}

function daysAgo(d: number): string {
  return hoursAgo(d * 24);
}

function baseOrder(overrides: Partial<Order> & Pick<Order, "id" | "orderNumber" | "status" | "items" | "createdAt">): Order {
  return {
    customerName: "Customer",
    phone: "01700000000",
    address: "House 12, Road 4, Dhanmondi",
    district: "Dhaka",
    area: "Dhanmondi",
    deliveryCharge: 120,
    courier: { company: "", trackingId: "", forwardCost: 0, returnCost: 0, otherCost: 0 },
    delivery: { customerPaid: 0 },
    returnInfo: { returnRequired: false, returnReceived: false },
    cancellation: {},
    activity: [],
    updatedAt: overrides.createdAt,
    ...overrides,
  };
}

// --- Pending: nothing reserved-side-effect yet beyond the reservation ----
const pendingItems = [line("NK-AM270-BLA-42", 1), line("NK-AM270-WHI-41", 1)];
pendingItems.forEach((i) => reserve(i.sku, i.qty));

// --- Processing -----------------------------------------------------------
const processingItems = [line("AD-UB22-BLA-37", 2)];
processingItems.forEach((i) => reserve(i.sku, i.qty));

// --- In Transit -------------------------------------------------------------
const inTransitItems = [line("PM-RSX-BLU-31", 1)];
inTransitItems.forEach((i) => reserve(i.sku, i.qty));

// --- Delivered (stock permanently consumed) --------------------------------
const deliveredItems = [line("NK-AM270-WHI-40", 1)];
deliveredItems.forEach((i) => consume(i.sku, i.qty));

// --- Partial Delivered, still returning (reserved held) --------------------
const partialItems = [line("AD-UB22-GRE-38", 2)];
partialItems.forEach((i) => reserve(i.sku, i.qty));

// --- Refuse Return, already returned & restocked (net reserved change = 0) -
const refuseItems = [line("VN-OS-BLA-39", 1)];

// --- Cancelled (net reserved change = 0, released immediately) -------------
const cancelledItems = [line("PM-RSX-YEL-32", 1)];

export const SEED_ORDERS: Order[] = [
  baseOrder({
    id: "o-pending-1",
    orderNumber: "ORD-10240",
    status: "pending",
    items: pendingItems,
    customerName: "Rahim Uddin",
    phone: "01711223344",
    address: "House 22, Road 7, Mirpur",
    district: "Dhaka",
    area: "Mirpur",
    createdAt: hoursAgo(2),
    activity: [{ id: crypto.randomUUID(), at: hoursAgo(2), label: "Order Created" }],
  }),
  baseOrder({
    id: "o-processing-1",
    orderNumber: "ORD-10239",
    status: "processing",
    items: processingItems,
    customerName: "Karim Sheikh",
    phone: "01822334455",
    address: "45 Bijoy Sarani",
    district: "Dhaka",
    area: "Tejgaon",
    createdAt: hoursAgo(9),
    activity: [
      { id: crypto.randomUUID(), at: hoursAgo(9), label: "Order Created" },
      { id: crypto.randomUUID(), at: hoursAgo(7), label: "Marked Processing" },
    ],
  }),
  baseOrder({
    id: "o-transit-1",
    orderNumber: "ORD-10235",
    status: "in_transit",
    items: inTransitItems,
    customerName: "Anika Ferdous",
    phone: "01933445566",
    address: "12 CDA Avenue",
    district: "Chattogram",
    area: "Agrabad",
    courier: { company: "Steadfast", trackingId: "STF-88213", dispatchDate: hoursAgo(20), forwardCost: 100, returnCost: 0, otherCost: 0 },
    createdAt: daysAgo(2),
    activity: [
      { id: crypto.randomUUID(), at: daysAgo(2), label: "Order Created" },
      { id: crypto.randomUUID(), at: daysAgo(2), label: "Marked Processing" },
      { id: crypto.randomUUID(), at: hoursAgo(20), label: "Dispatched via Steadfast", detail: "Tracking STF-88213" },
    ],
  }),
  baseOrder({
    id: "o-delivered-1",
    orderNumber: "ORD-10221",
    status: "delivered",
    items: deliveredItems,
    customerName: "Sabbir Hossain",
    phone: "01611998877",
    address: "House 4, Sector 11, Uttara",
    district: "Dhaka",
    area: "Uttara",
    courier: { company: "Pathao Courier", trackingId: "PTH-55210", dispatchDate: daysAgo(4), forwardCost: 90, returnCost: 0, otherCost: 0 },
    delivery: { customerPaid: 7620, deliveryDate: daysAgo(3), settlementStatus: "settled" },
    createdAt: daysAgo(5),
    activity: [
      { id: crypto.randomUUID(), at: daysAgo(5), label: "Order Created" },
      { id: crypto.randomUUID(), at: daysAgo(5), label: "Marked Processing" },
      { id: crypto.randomUUID(), at: daysAgo(4), label: "Dispatched via Pathao Courier", detail: "Tracking PTH-55210" },
      { id: crypto.randomUUID(), at: daysAgo(3), label: "Marked Delivered", detail: "Collected ৳7,620" },
    ],
  }),
  baseOrder({
    id: "o-partial-1",
    orderNumber: "ORD-10218",
    status: "partial_delivered",
    items: partialItems,
    customerName: "Nusrat Jahan",
    phone: "01555112233",
    address: "House 9, Road 2, Banani",
    district: "Dhaka",
    area: "Banani",
    courier: { company: "RedX", trackingId: "RDX-33110", dispatchDate: daysAgo(6), forwardCost: 110, returnCost: 90, otherCost: 0 },
    delivery: { customerPaid: 80, deliveryDate: daysAgo(5) },
    returnInfo: { returnRequired: true, returnReceived: false },
    createdAt: daysAgo(7),
    activity: [
      { id: crypto.randomUUID(), at: daysAgo(7), label: "Order Created" },
      { id: crypto.randomUUID(), at: daysAgo(7), label: "Marked Processing" },
      { id: crypto.randomUUID(), at: daysAgo(6), label: "Dispatched via RedX", detail: "Tracking RDX-33110" },
      { id: crypto.randomUUID(), at: daysAgo(5), label: "Marked Partial Delivered", detail: "Customer paid ৳80 of ৳17,800" },
    ],
  }),
  baseOrder({
    id: "o-refuse-1",
    orderNumber: "ORD-10205",
    status: "refuse_return",
    items: refuseItems,
    customerName: "Tanvir Alam",
    phone: "01977889900",
    address: "House 18, Block C, Bashundhara",
    district: "Dhaka",
    area: "Bashundhara",
    courier: { company: "Steadfast", trackingId: "STF-77004", dispatchDate: daysAgo(10), forwardCost: 100, returnCost: 80, otherCost: 0 },
    delivery: { customerPaid: 0, deliveryDate: daysAgo(9) },
    returnInfo: { returnRequired: true, returnReceived: true, returnDate: daysAgo(7) },
    createdAt: daysAgo(11),
    activity: [
      { id: crypto.randomUUID(), at: daysAgo(11), label: "Order Created" },
      { id: crypto.randomUUID(), at: daysAgo(11), label: "Marked Processing" },
      { id: crypto.randomUUID(), at: daysAgo(10), label: "Dispatched via Steadfast", detail: "Tracking STF-77004" },
      { id: crypto.randomUUID(), at: daysAgo(9), label: "Marked Refuse Return" },
      { id: crypto.randomUUID(), at: daysAgo(7), label: "Return Received", detail: "Stock restored" },
    ],
  }),
  baseOrder({
    id: "o-cancelled-1",
    orderNumber: "ORD-10190",
    status: "cancelled",
    items: cancelledItems,
    customerName: "Farhana Akter",
    phone: "01444556677",
    address: "House 3, Road 9, Mohammadpur",
    district: "Dhaka",
    area: "Mohammadpur",
    cancellation: {
      cancelledAt: daysAgo(12),
      cancelledBy: "Admin (Ayesha Khan)",
      reason: "customer_changed_mind",
      notes: "Customer called to say they no longer need the shoes.",
    },
    createdAt: daysAgo(13),
    activity: [
      { id: crypto.randomUUID(), at: daysAgo(13), label: "Order Created" },
      { id: crypto.randomUUID(), at: daysAgo(12), label: "Cancelled", detail: "Customer Changed Mind" },
    ],
  }),
];
