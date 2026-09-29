import type { Product, StockStatus, StockUpdateMode, Variant } from "./types";
import { runtime } from "@/lib/settings/runtime";
import { buildSku, variantLevelTemplate } from "@/lib/settings/sku";

/** Live value from Settings → Inventory (default 10). */
export const lowStockThreshold = () => runtime.lowStockThreshold;

export function stockStatusFor(stock: number): StockStatus {
  if (stock <= 0) return "out-of-stock";
  if (stock <= runtime.lowStockThreshold) return "low-stock";
  return "in-stock";
}

export function totalStock(product: Product): number {
  return product.variants.reduce((sum, v) => sum + v.stock, 0);
}

export function productStockStatus(product: Product): StockStatus {
  if (!product.variants.length) return "out-of-stock";
  return stockStatusFor(totalStock(product));
}

export function lowStockVariantCount(product: Product): number {
  return product.variants.filter((v) => stockStatusFor(v.stock) === "low-stock").length;
}

export function outOfStockVariantCount(product: Product): number {
  return product.variants.filter((v) => v.stock <= 0).length;
}

function skuSafe(text: string): string {
  return text.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 3) || "VAR";
}

/**
 * Builds the full variant matrix for a color x size grid. Existing variants
 * (matched by color+size) are preserved so stock/sku edits aren't lost when
 * regenerating after adding a new color or size.
 *
 * The variant SKU suffix (color/size part) follows the admin's Settings →
 * Product → "SKU format template" — including the order they put {COLOR}
 * and {SIZE} in. Falls back to the old COLOR-SIZE suffix when no format is
 * supplied, or when the template doesn't produce anything usable.
 */
export function generateVariants(
  colors: string[],
  sizes: string[],
  base: { sku: string; cost: number; price: number },
  existing: Variant[] = [],
  skuFormat?: string
): Variant[] {
  const suffixTemplate = skuFormat ? variantLevelTemplate(skuFormat) : "{COLOR}-{SIZE}";
  const list: Variant[] = [];
  for (const color of colors) {
    for (const size of sizes) {
      const match = existing.find((v) => v.color === color && v.size === size);
      if (match) {
        list.push(match);
        continue;
      }
      const suffix = buildSku(suffixTemplate, { color, size }) || `${skuSafe(color)}-${size}`;
      list.push({
        id: crypto.randomUUID(),
        color,
        size,
        sku: base.sku ? `${base.sku}-${suffix}` : suffix,
        barcode: "",
        cost: base.cost || 0,
        price: base.price || 0,
        stock: 0,
        reserved: 0,
        status: "active",
      });
    }
  }
  return list;
}

export function availableStock(variant: { stock: number; reserved: number }): number {
  return Math.max(0, variant.stock - (variant.reserved ?? 0));
}

export function applyStockMode(current: number, value: number, mode: StockUpdateMode): number {
  if (mode === "set") return Math.max(0, value);
  if (mode === "add") return Math.max(0, current + value);
  return Math.max(0, current - value);
}

export function formatTaka(value: number, decimals: number = runtime.decimals): string {
  return `\u09F3${value.toLocaleString(runtime.locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export function slugSku(name: string): string {
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 20);
}
