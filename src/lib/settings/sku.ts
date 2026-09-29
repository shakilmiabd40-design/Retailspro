const clean = (s: string, len: number) => s.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, len);

/** Fills the SKU template. Tokens with no value (e.g. {COLOR} on a product-level SKU) are dropped. */
export function buildSku(template: string, parts: { brand?: string; product?: string; color?: string; size?: string }): string {
  const values: Record<string, string> = {
    BRAND: clean(parts.brand ?? "", 4),
    PRODUCT: clean(parts.product ?? "", 12),
    COLOR: clean(parts.color ?? "", 3),
    SIZE: (parts.size ?? "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, ""),
  };
  return template
    .replace(/\{(BRAND|PRODUCT|COLOR|SIZE)\}/g, (_, k: string) => values[k])
    .replace(/[-_]{2,}/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");
}

/** The part of the template that applies to a whole product (variant tokens removed). */
export function productLevelTemplate(template: string): string {
  return template
    .replace(/\{(COLOR|SIZE)\}/g, "")
    .replace(/[-_]{2,}/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");
}

/** The part of the template that applies to a single variant (brand/product tokens removed). Keeps whatever order/separators the admin configured for {COLOR}/{SIZE}. */
export function variantLevelTemplate(template: string): string {
  return template
    .replace(/\{(BRAND|PRODUCT)\}/g, "")
    .replace(/[-_]{2,}/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");
}
