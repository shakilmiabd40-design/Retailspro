/**
 * Inventory snapshot report builders (server side).
 *
 * Two read-only snapshots:
 *  - **Inventory Stock**: on-hand, reserved and available units per variant,
 *    with the notification thresholds applied.
 *  - **Inventory Valuation**: on-hand quantity × unit cost, plus the last day a
 *    variant was sold (used to spot dead stock).
 *
 * Cost is sensitive: the caller only receives unit cost and value when the
 * role is allowed to see product cost prices.
 *
 * Keep this module free of server-only / database imports so it can be unit tested.
 */

import type { Product } from "@/lib/products/types";
import { deriveStatus, levelUpperBound, type SkuSnapshot } from "@/lib/notifications/engine";
import type { InventoryStatus, NotificationSettings, TrackedState } from "@/lib/notifications/types";
import { matchesProductFilters, type ProductFilterFields } from "@/lib/reports/orders";
import type { InventoryStockKpis, InventoryStockReport, InventoryStockRow, InventoryValueKpis, InventoryValueReport, InventoryValueRow } from "@/lib/reports/types";
import type { StockProduct } from "./inventory-data";

export type { StockProduct };

export type StockLabel = "In Stock" | "Low Stock" | "Out of Stock";

export interface InventoryStockBuildOptions extends ProductFilterFields {
  /** Notification thresholds (reorder point, monitor band). */
  settings: NotificationSettings;
  /** Tracked notification state per variant, used for the alert column. */
  states: Record<string, TrackedState>;
  /** Live stock snapshots (available units, incoming purchase orders). */
  snapshots: SkuSnapshot[];
}

const labelFor = (available: number, lowBand: number): StockLabel =>
  available <= 0 ? "Out of Stock" : available <= lowBand ? "Low Stock" : "In Stock";

export function buildInventoryStockReport(products: StockProduct[], options: InventoryStockBuildOptions): InventoryStockReport {
  const { settings, states, snapshots } = options;
  const lowBand = levelUpperBound("monitor", settings);
  const snapshotByVariant = new Map(snapshots.map((snapshot) => [snapshot.variantId, snapshot]));

  const rows: InventoryStockRow[] = [];
  for (const product of products) {
    for (const variant of product.variants) {
      if (!matchesProductFilters({ productId: product.id, sku: variant.sku }, options, metaOf(products))) continue;

      const available = Math.max(0, variant.stock - variant.reserved);
      const snapshot = snapshotByVariant.get(variant.id);
      // Only variants the stock board tracks carry an alert status; the tracked state wins
      // over the freshly derived one, exactly like the notification board does.
      const alert: InventoryStatus | null = snapshot ? states[variant.id]?.status ?? deriveStatus(snapshot, settings) : null;

      rows.push({
        variantId: variant.id,
        productId: product.id,
        product: product.name,
        variant: `${variant.color} / ${variant.size}`,
        sku: variant.sku,
        category: product.category,
        brand: product.brand,
        active: product.status === "active" && variant.status === "active",
        available,
        reserved: variant.reserved,
        onHand: variant.stock,
        reorder: settings.reorderPoint,
        label: labelFor(available, lowBand),
        alert,
      });
    }
  }

  rows.sort((a, b) => a.available - b.available || a.product.localeCompare(b.product));

  const kpis: InventoryStockKpis = {
    totalVariants: rows.length,
    inStock: rows.filter((row) => row.label === "In Stock").length,
    lowStock: rows.filter((row) => row.label === "Low Stock").length,
    outOfStock: rows.filter((row) => row.label === "Out of Stock").length,
  };

  return { rows, kpis, lowBand };
}

/** Category / brand lookup for the product filters. */
function metaOf(products: StockProduct[]) {
  return new Map(products.map((product) => [product.id, { category: product.category, brand: product.brand }]));
}

export interface InventoryValueBuildOptions extends ProductFilterFields {
  /** Variant id → the day it was last sold (YYYY-MM-DD), or missing when never sold. */
  lastSoldDays: Map<string, string>;
  /** Today's business day (YYYY-MM-DD). */
  today: string;
  /** A variant is dead when it has stock but no sale in the last N days. */
  deadDays: number;
  /** False for roles that may not see product cost prices. */
  seesCost: boolean;
}

export function buildInventoryValueReport(products: StockProduct[], options: InventoryValueBuildOptions): InventoryValueReport {
  const { lastSoldDays, today, deadDays, seesCost } = options;
  const meta = metaOf(products);
  const cutoff = shiftDay(today, -Math.max(1, deadDays));

  const rows: InventoryValueRow[] = [];
  for (const product of products) {
    for (const variant of product.variants) {
      if (variant.stock <= 0) continue;
      if (!matchesProductFilters({ productId: product.id, sku: variant.sku }, options, meta)) continue;

      const lastSold = lastSoldDays.get(variant.id) ?? null;
      rows.push({
        variantId: variant.id,
        product: product.name,
        variant: `${variant.color} / ${variant.size}`,
        sku: variant.sku,
        category: product.category || "Uncategorized",
        qty: variant.stock,
        unitCost: seesCost ? variant.cost : null,
        value: seesCost ? variant.stock * variant.cost : null,
        lastSoldDay: lastSold,
        // Stock that has not moved for N days: the sale day is on or before the cutoff.
        dead: !lastSold || lastSold <= cutoff,
      });
    }
  }

  rows.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  const dead = rows.filter((row) => row.dead);
  const kpis: InventoryValueKpis = {
    totalQty: rows.reduce((sum, row) => sum + row.qty, 0),
    totalValue: seesCost ? rows.reduce((sum, row) => sum + (row.value ?? 0), 0) : null,
    deadQty: dead.reduce((sum, row) => sum + row.qty, 0),
    deadValue: seesCost ? dead.reduce((sum, row) => sum + (row.value ?? 0), 0) : null,
  };

  return { rows, kpis };
}

/** Moves an ISO day string by a number of days. */
export function shiftDay(day: string, delta: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

/** The narrow product read only carries the fields the snapshot helpers use. */
export function asSnapshotProducts(products: StockProduct[]): Product[] {
  return products as unknown as Product[];
}
