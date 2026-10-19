import type { PurchaseOrder, POItem } from "./types";
import { SEED_PRODUCTS } from "../products/seed-data";

function findVariant(sku: string) {
  for (const p of SEED_PRODUCTS) {
    const v = p.variants.find((v) => v.sku === sku);
    if (v) return { product: p, variant: v };
  }
  throw new Error(`Seed variant not found: ${sku}`);
}

function poLine(sku: string, qtyOrdered: number, qtyReceived: number, unitCost?: number): POItem {
  const { product, variant } = findVariant(sku);
  // Keep seeded product stock consistent with any qty already marked received.
  if (qtyReceived > 0) {
    variant.stock = variant.stock + qtyReceived;
  }
  return {
    id: crypto.randomUUID(),
    productId: product.id,
    productName: product.name,
    variantId: variant.id,
    color: variant.color,
    size: variant.size,
    sku: variant.sku,
    qtyOrdered,
    qtyReceived,
    unitCost: unitCost ?? variant.cost,
  };
}

function daysAgo(d: number): string {
  return new Date(Date.now() - d * 24 * 60 * 60 * 1000).toISOString();
}

export const SEED_PURCHASE_ORDERS: PurchaseOrder[] = [
  {
    id: "po-draft-1",
    poNumber: "PO-3001",
    supplierId: "sup-1",
    status: "draft",
    poDate: daysAgo(1),
    expectedDate: undefined,
    notes: "Restock plan for next month — pending approval.",
    items: [poLine("NK-AM270-BLA-40", 20, 0), poLine("NK-AM270-WHI-42", 15, 0)],
    shippingCost: 0,
    discount: 0,
    receivings: [],
    createdAt: daysAgo(1),
    updatedAt: daysAgo(1),
  },
  {
    id: "po-approved-1",
    poNumber: "PO-2998",
    supplierId: "sup-2",
    status: "approved",
    poDate: daysAgo(6),
    expectedDate: daysAgo(-2),
    notes: "",
    items: [poLine("AD-UB22-BLA-37", 30, 0), poLine("AD-UB22-GRE-38", 20, 0)],
    shippingCost: 1500,
    discount: 0,
    receivings: [],
    createdAt: daysAgo(6),
    updatedAt: daysAgo(6),
  },
  {
    id: "po-partial-1",
    poNumber: "PO-2990",
    supplierId: "sup-1",
    status: "partially_received",
    poDate: daysAgo(14),
    expectedDate: daysAgo(9),
    notes: "",
    items: [poLine("PM-RSX-BLU-30", 40, 25), poLine("PM-RSX-YEL-31", 30, 30)],
    shippingCost: 1200,
    discount: 500,
    receivings: [
      {
        id: crypto.randomUUID(),
        date: daysAgo(9),
        items: [
          { variantId: findVariant("PM-RSX-BLU-30").variant.id, qty: 25, unitCost: findVariant("PM-RSX-BLU-30").variant.cost },
          { variantId: findVariant("PM-RSX-YEL-31").variant.id, qty: 30, unitCost: findVariant("PM-RSX-YEL-31").variant.cost },
        ],
        note: "First batch received at warehouse.",
      },
    ],
    createdAt: daysAgo(14),
    updatedAt: daysAgo(9),
  },
  {
    id: "po-received-1",
    poNumber: "PO-2975",
    supplierId: "sup-2",
    status: "received",
    poDate: daysAgo(30),
    expectedDate: daysAgo(24),
    notes: "",
    items: [poLine("VN-OS-BLA-40", 20, 20)],
    shippingCost: 800,
    discount: 0,
    receivings: [
      {
        id: crypto.randomUUID(),
        date: daysAgo(24),
        items: [{ variantId: findVariant("VN-OS-BLA-40").variant.id, qty: 20, unitCost: findVariant("VN-OS-BLA-40").variant.cost }],
        note: "Full shipment received.",
      },
    ],
    createdAt: daysAgo(30),
    updatedAt: daysAgo(24),
  },
];
