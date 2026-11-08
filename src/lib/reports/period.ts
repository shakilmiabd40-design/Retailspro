/** Date-only helpers shared by client reports and server report queries. */

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDay(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DAY.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function shiftDay(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/**
 * Previous period of exactly the same number of calendar days, ending the day
 * before `from`. Both arguments and the result are inclusive YYYY-MM-DD days.
 */
export function previousPeriodRange(from: string, to: string): { from: string; to: string } {
  if (!isIsoDay(from) || !isIsoDay(to) || from > to) {
    throw new Error("previousPeriodRange needs a valid inclusive YYYY-MM-DD range.");
  }
  const fromMs = new Date(`${from}T00:00:00.000Z`).getTime();
  const toMs = new Date(`${to}T00:00:00.000Z`).getTime();
  const daySpan = Math.round((toMs - fromMs) / 86_400_000) + 1;
  const prevTo = shiftDay(from, -1);
  const prevFrom = shiftDay(prevTo, -(daySpan - 1));
  return { from: prevFrom, to: prevTo };
}
