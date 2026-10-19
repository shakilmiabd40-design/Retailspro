import { query } from "@/server/db";
import { ApiError, json, readJson, route } from "@/server/http";
import { requireAuth } from "@/server/auth";
import { COUNTER_START } from "@/server/collections";

export const dynamic = "force-dynamic";

/** Reserves `count` consecutive numbers for a sequence (order / po / return / warranty / claim). */
export const POST = route(async (req) => {
  await requireAuth(req);
  const body = await readJson<{ name?: string; count?: number }>(req);
  const name = String(body.name ?? "");
  const count = Math.min(25, Math.max(1, Math.floor(Number(body.count) || 1)));
  if (!(name in COUNTER_START)) throw new ApiError(400, "unknown_counter", "Unknown number sequence.");
  const { rows } = await query<{ value: string }>(
    `insert into app_counters (name, value) values ($1, $2::bigint + $3::bigint)
     on conflict (name) do update set value = app_counters.value + $3::bigint
     returning value::text`,
    [name, COUNTER_START[name], count]
  );
  const end = Number(rows[0].value);
  return json({ numbers: Array.from({ length: count }, (_, i) => end - count + i) });
});
