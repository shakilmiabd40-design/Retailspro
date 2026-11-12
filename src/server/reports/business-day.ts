/**
 * The business calendar day used by every report.
 *
 * A plain `YYYY-MM-DD` value is already a calendar day and is never shifted.
 * A full timestamp is an instant and is converted to Asia/Dhaka before its day
 * is taken, so the result does not depend on the server or browser timezone.
 */

export const REPORT_TIME_ZONE = "Asia/Dhaka";

const dhakaDayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: REPORT_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function dhakaDay(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return dhakaDayFormat.format(date);
}

/** A local-noon Date for a calendar-day string; safe for locale-based bucket calculations. */
export function localDateForDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}

/** Inclusive calendar-day range check over ISO day strings. */
export function dayInRange(day: string | null, from: string, to: string): day is string {
  return day !== null && day >= from && day <= to;
}
