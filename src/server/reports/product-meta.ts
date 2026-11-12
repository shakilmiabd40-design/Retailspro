import "server-only";
import { query } from "@/server/db";
import { RevisionCache, revisionKey } from "@/server/revision-cache";

/**
 * Product metadata a report needs: category and brand per product.
 *
 * Only those two fields are read, so a report never pulls the whole catalog
 * (variants, stock, costs) into the browser. Cached against the products
 * revision, so a changed catalog invalidates it.
 */

export interface ProductMetaEntry {
  category: string;
  brand: string;
}

const metaCache = new RevisionCache<Map<string, ProductMetaEntry>>(4);

export async function loadProductMeta(): Promise<Map<string, ProductMetaEntry>> {
  const rev = await revisionKey(["products"]);
  return metaCache.get(rev, async () => {
    const { rows } = await query<{ id: string | null; category: string | null; brand: string | null }>(
      `select data->>'id' as id,
              coalesce(data->>'category','') as category,
              coalesce(data->>'brand','') as brand
         from app_records
        where collection='products'`,
    );
    return new Map(
      rows.filter((row): row is { id: string; category: string; brand: string } => !!row.id).map((row) => [row.id, { category: row.category, brand: row.brand }]),
    );
  });
}
