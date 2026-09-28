import { query } from "@/server/db";
import { json, readJson, route } from "@/server/http";
import { requireAuth } from "@/server/auth";
import { COUNTER_START } from "@/server/collections";

export const dynamic = "force-dynamic";

/**
 * Hands back numbers this browser reserved but never used (sent on page close) so sequences stay gapless
 * in the common single-user case. Only succeeds when they are still the newest numbers issued.
 */
export const POST = route(async (req) => {
  await requireAuth(req, { passive: true });
  const body = await readJson<{ name?: string; numbers?: number[] }>(req);
  const name = String(body.name ?? "");
  const nums = (Array.isArray(body.numbers) ? body.numbers : []).map(Number).filter(Number.isInteger).sort((a, b) => a - b);
  if (!(name in COUNTER_START) || !nums.length) return json({ released: false });
  for (let i = 1; i < nums.length; i++) if (nums[i] !== nums[i - 1] + 1) return json({ released: false });
  const { rowCount } = await query("update app_counters set value = $2::bigint where name = $1 and value = $3::bigint", [name, nums[0], nums[nums.length - 1] + 1]);
  return json({ released: (rowCount ?? 0) > 0 });
});
