import "server-only";
import type { Order } from "@/lib/orders/types";
import type { DateTypeKey } from "@/lib/reports/dates";
import { query } from "@/server/db";
import { RevisionCache, revisionKey } from "@/server/revision-cache";

export const ORDER_REPORT_DATE_TYPES: DateTypeKey[] = [
  "order_created",
  "delivered",
  "dispatch",
  "final_status",
  "return_received",
];

const orderCache = new RevisionCache<Order[]>(8);

function shiftedDay(day: string, delta: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

/**
 * Orders that *might* fall inside the requested day range for the chosen date type.
 *
 * The SQL window is deliberately wider than the exact report window. Dates in an
 * order are a mix of stored calendar days (`deliveryDate`) and UTC instants
 * (`createdAt`, activity entries), so the caller applies the exact Asia/Dhaka day
 * comparison afterwards. Treating this as a broad candidate set keeps the query
 * index-friendly without changing the report's date semantics.
 */
export async function loadOrderCandidates(
  from: string,
  to: string,
  dateType: DateTypeKey,
  includeCreated = false,
): Promise<Order[]> {
  const lower = shiftedDay(from, -1);
  const upper = shiftedDay(to, 2);
  const broad = (expression: string) => `(${expression} >= $1 and ${expression} < $2)`;
  const created = broad("data->>'createdAt'");
  const updated = broad("data->>'updatedAt'");
  const delivered = broad("data #>> '{delivery,deliveryDate}'");
  const dispatched = broad("data #>> '{courier,dispatchDate}'");
  const returned = broad("data #>> '{returnInfo,returnDate}'");
  const cancelled = broad("data #>> '{cancellation,cancelledAt}'");
  const activity = `exists (
    select 1 from jsonb_array_elements(coalesce(data->'activity','[]'::jsonb)) a
     where a->>'at' >= $1 and a->>'at' < $2
  )`;

  let candidates: string;
  switch (dateType) {
    case "order_created":
      candidates = created;
      break;
    case "delivered":
      candidates = `(${delivered} or ${updated} or ${activity})`;
      break;
    case "dispatch":
      candidates = `(${dispatched} or ${activity})`;
      break;
    case "return_received":
      candidates = returned;
      break;
    case "final_status":
      candidates = `(${updated} or ${delivered} or ${cancelled} or ${activity})`;
      break;
    default:
      throw new Error(`Unsupported order report date type: ${dateType}`);
  }
  if (includeCreated && dateType !== "order_created") candidates = `(${candidates} or ${created})`;

  const rev = await revisionKey(["orders"]);
  const cacheKey = `${rev}|${dateType}|${from}|${to}|${includeCreated ? 1 : 0}`;
  const orders = await orderCache.get(cacheKey, async () => {
    const { rows } = await query<{ data: Order }>(
      `select data from app_records where collection='orders' and ${candidates} order by seq desc`,
      [lower, upper],
    );
    return rows.map((row) => row.data);
  });
  // Very large result sets are not worth holding; let the next request re-read them.
  if (orders.length > 3000) orderCache.delete(cacheKey);
  return orders;
}
