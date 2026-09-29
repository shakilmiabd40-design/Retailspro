import "server-only";
import { query } from "./db";
import { FALLBACK_SHOP_NAME } from "@/lib/settings/shop";

/** The shop name from Settings → Company, for emails, file names and webhook messages. Never throws. */
export async function getShopName(): Promise<string> {
  try {
    const { rows } = await query<{ n: string | null }>("select data->'company'->>'shopName' as n from app_documents where key = 'settings'");
    return rows[0]?.n?.trim() || FALLBACK_SHOP_NAME;
  } catch {
    return FALLBACK_SHOP_NAME;
  }
}
