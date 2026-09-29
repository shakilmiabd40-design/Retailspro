/** Shown only until a shop name is saved in Settings → Company. */
export const FALLBACK_SHOP_NAME = "My Shop";

/** "Karim Footwear & Co." → "karim-footwear-co" — for file names. */
export function shopSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "shop"
  );
}
