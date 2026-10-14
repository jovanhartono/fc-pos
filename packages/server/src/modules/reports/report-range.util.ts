import { type SQLWrapper, sql } from "drizzle-orm";

const JAKARTA_OFFSET_MINUTES = 7 * 60;
export const DAY_MS = 86_400_000;

export type Granularity = "day" | "week" | "month" | "year";

export interface DateRange {
  end: Date;
  start: Date;
}

export function getJakartaDayRange(date: string): DateRange {
  const [year, month, day] = date.split("-").map(Number);
  const startUtcMs =
    Date.UTC(year, month - 1, day, 0, 0, 0) - JAKARTA_OFFSET_MINUTES * 60_000;
  const start = new Date(startUtcMs);
  const end = new Date(startUtcMs + DAY_MS);
  return { start, end };
}

export function getJakartaRange(from: string, to: string): DateRange {
  const { start } = getJakartaDayRange(from);
  const { end } = getJakartaDayRange(to);
  return { start, end };
}

export function shiftDate(date: string, deltaDays: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + deltaDays));
  return formatYmd(shifted);
}

export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const diff = Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd);
  return Math.round(diff / DAY_MS) + 1;
}

export function derivePreviousRange(
  from: string,
  to: string
): { from: string; to: string } {
  const span = daysBetween(from, to);
  return {
    from: shiftDate(from, -span),
    to: shiftDate(to, -span),
  };
}

export function pickGranularity(from: string, to: string): Granularity {
  const days = daysBetween(from, to);
  if (days <= 31) {
    return "day";
  }
  if (days <= 120) {
    return "week";
  }
  if (days <= 730) {
    return "month";
  }
  return "year";
}

export function bucketFormat(granularity: Granularity): string {
  if (granularity === "day") {
    return "YYYY-MM-DD";
  }
  if (granularity === "week") {
    return "IYYY-IW";
  }
  if (granularity === "month") {
    return "YYYY-MM";
  }
  return "YYYY";
}

// jakartaDayOf is the JS twin of the day bucket; change the two together.
// Columns hold UTC wall time in a plain `timestamp`, so naming UTC first is what
// keeps a 13:16 Jakarta order off the previous day.
export function jakartaBucketExpr(
  column: SQLWrapper,
  granularity: Granularity
) {
  const fmt = sql.raw(`'${bucketFormat(granularity)}'`);
  const wallTime = sql`(${column} AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta'`;
  return sql<string>`to_char(${wallTime}, ${fmt})`;
}

export function enumerateBuckets(
  from: string,
  to: string,
  granularity: Granularity
): string[] {
  const days = enumerateDays(from, to);
  if (granularity === "day") {
    return days;
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const day of days) {
    const bucket = dayToBucket(day, granularity);
    if (!seen.has(bucket)) {
      seen.add(bucket);
      out.push(bucket);
    }
  }
  return out;
}

export function enumerateDays(from: string, to: string): string[] {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const startMs = Date.UTC(fy, fm - 1, fd);
  const endMs = Date.UTC(ty, tm - 1, td);
  const out: string[] = [];
  for (let ms = startMs; ms <= endMs; ms += DAY_MS) {
    out.push(formatYmd(new Date(ms)));
  }
  return out;
}

// The Monday on or before a day.
export function weekStartOf(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return shiftDate(day, -((weekday + 6) % 7));
}

export function dayToBucket(day: string, granularity: Granularity): string {
  if (granularity === "day") {
    return day;
  }
  if (granularity === "month") {
    return day.slice(0, 7);
  }
  if (granularity === "year") {
    return day.slice(0, 4);
  }
  return toIsoWeekString(day);
}

export function indexBy<T extends { bucket: string }>(rows: T[]) {
  const map = new Map<string, T>();
  for (const row of rows) {
    map.set(row.bucket, row);
  }
  return map;
}

// The Jakarta calendar day an instant falls on.
export function jakartaDayOf(instant: Date): string {
  return formatYmd(
    new Date(instant.getTime() + JAKARTA_OFFSET_MINUTES * 60_000)
  );
}

// Same answer as Postgres' percentile_cont: p of the way along the sorted
// values, interpolating between the two either side.
export function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * p;
  const below = Math.floor(position);
  const above = Math.ceil(position);
  return sorted[below] + (sorted[above] - sorted[below]) * (position - below);
}

export const rate = (part: number, whole: number) =>
  whole > 0 ? Number((part / whole).toFixed(4)) : 0;

export function deltaPct(current: number, previous: number): number | null {
  if (previous === 0) {
    return null;
  }
  return (current - previous) / previous;
}

function toIsoWeekString(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  const weekNum = Math.ceil(((date.getTime() - yearStart) / DAY_MS + 1) / 7);
  return `${date.getUTCFullYear()}-${String(weekNum).padStart(2, "0")}`;
}

function formatYmd(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
