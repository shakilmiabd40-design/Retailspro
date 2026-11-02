import { query, tx } from "@/server/db";
import { ApiError, json, readJson, route } from "@/server/http";
import { requireAuth } from "@/server/auth";
import { COUNTER_START } from "@/server/collections";

export const dynamic = "force-dynamic";

function lockKey(name: string) {
  // deterministic int key for advisory lock
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 131542391 + name.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Reserves `count` consecutive numbers for a sequence (order / po / return / warranty / claim). */
export const POST = route(async (req) => {
  await requireAuth(req);
  const body = await readJson<{ name?: string; count?: number }>(req);
  const name = String(body.name ?? "");
  const count = Math.min(25, Math.max(1, Math.floor(Number(body.count) || 1)));
  if (!(name in COUNTER_START)) throw new ApiError(400, "unknown_counter", "Unknown number sequence.");
  const result = await tx(async (client) => {
    await client.query("select pg_advisory_xact_lock($1)", [lockKey(name)]);
    const { rows } = await client.query<{ value: string }>(
      `insert into app_counters (name, value) values ($1, $2::bigint + $3::bigint)
       on conflict (name) do update set value = app_counters.value + $3::bigint
       returning value::text`,
      [name, COUNTER_START[name], count]
    );
    const end = Number(rows[0].value);
    return { numbers: Array.from({ length: count }, (_, i) => end - count + i) };
  });
  return json(result);
});
