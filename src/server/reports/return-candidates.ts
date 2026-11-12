import "server-only";
import type { ReturnRecord, ReturnType } from "@/lib/returns/types";
import { query } from "@/server/db";
import { RevisionCache, revisionKey } from "@/server/revision-cache";

/**
 * Returns that *might* belong to a report period.
 *
 * The SQL window is deliberately wider than the exact report window (one day
 * before, two days after) because a return carries both a stored request date
 * and a stored receipt date; the caller applies the exact day comparison.
 */

const returnsCache = new RevisionCache<ReturnRecord[]>(8);

export async function loadReturnCandidates(from: string, to: string, type: ReturnType): Promise<ReturnRecord[]> {
  const lower = new Date(`${from}T00:00:00.000Z`);
  lower.setUTCDate(lower.getUTCDate() - 1);
  const upper = new Date(`${to}T00:00:00.000Z`);
  upper.setUTCDate(upper.getUTCDate() + 2);

  const rev = await revisionKey(["returns"]);
  const key = `${rev}|${type}|${from}|${to}`;
  const returns = await returnsCache.get(key, async () => {
    const { rows } = await query<{ data: ReturnRecord }>(
      `select data from app_records
        where collection='returns' and data->>'type'=$1
          and (
            ((data->>'createdAt') >= $2 and (data->>'createdAt') < $3)
            or ((data->>'returnReceivedAt') >= $2 and (data->>'returnReceivedAt') < $3)
          )
        order by seq desc`,
      [type, lower.toISOString(), upper.toISOString()],
    );
    return rows.map((row) => row.data);
  });
  // Very large result sets are not worth holding; let the next request re-read them.
  if (returns.length > 1500) returnsCache.delete(key);
  return returns;
}
