import type { DateTypeKey } from "@/lib/reports/dates";
import type { Order } from "@/lib/orders/types";
import { requireAuth } from "@/server/auth";
import { canRead, COLLECTION_ACCESS } from "@/server/collections";
import { query } from "@/server/db";
import { ApiError, json, route } from "@/server/http";
import { RevisionCache, revisionKey } from "@/server/revision-cache";

export const dynamic = "force-dynamic";
const orderCache = new RevisionCache<Order[]>(8);
const DATE_TYPES: DateTypeKey[] = ["order_created", "delivered", "dispatch", "final_status", "return_received"];

const validDay = (value: string | null): value is string => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
};

function shiftedDay(day: string, delta: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

export const GET = route(async (req) => {
  const auth = await requireAuth(req, { passive: true });
  if (!canRead(auth.role, COLLECTION_ACCESS.orders)) throw new ApiError(403, "forbidden", "You do not have access to orders.");
  const sp = req.nextUrl.searchParams;
  const from = sp.get("from");
  const to = sp.get("to");
  const dateType = sp.get("dateType") as DateTypeKey | null;
  const includeCreated = sp.get("includeCreated") === "1";
  if (!validDay(from) || !validDay(to) || from > to) throw new ApiError(400, "invalid_date_range", "Choose a valid order report date range.");
  if (!dateType || !DATE_TYPES.includes(dateType)) throw new ApiError(400, "invalid_date_type", "Choose a valid order report date type.");

  // This candidate window is intentionally wider than the user's browser-local date window.
  // The report's existing orderDateFor/inRange functions apply the exact local-day semantics.
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
    case "order_created": candidates = created; break;
    case "delivered": candidates = `(${delivered} or ${updated} or ${activity})`; break;
    case "dispatch": candidates = `(${dispatched} or ${activity})`; break;
    case "return_received": candidates = returned;
      break;
    case "final_status": candidates = `(${updated} or ${delivered} or ${cancelled} or ${activity})`;
      break;
    default: throw new ApiError(400, "invalid_date_type", "Choose a valid order report date type.");
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
  if (orders.length > 3000) orderCache.delete(cacheKey);
  return json({ orders });
});
