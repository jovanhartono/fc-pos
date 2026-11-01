import type { GetReportRangeQuery } from "@/modules/reports/report.schema";
import {
  getJakartaRange,
  jakartaDayOf,
} from "@/modules/reports/report-range.util";
import { listTurnaroundLines } from "@/modules/reports/turnaround.repository";

// Below this many Items a percentile says more about one odd Item than about
// the shop. A later Settings menu (#159) will own the number.
export const TURNAROUND_MIN_ITEMS = 10;

const ALL_ITEMS = "All Items";
const HOUR_MS = 3_600_000;

type Line = Awaited<ReturnType<typeof listTurnaroundLines>>[number];

interface Breakdown {
  in_progress_p75: number | null;
  queued_p75: number | null;
  waiting_qc_p75: number | null;
}

interface TurnaroundItem {
  categories: string[];
  hours: number;
  priority: boolean;
  ready_day: string;
  services: string[];
  store_code: string;
}

interface TurnaroundRow {
  breakdown: Breakdown;
  items: number;
  name: string;
  p75: number | null;
  p90: number | null;
  p99: number | null;
}

interface ItemGroup {
  categories: string[];
  hours: number;
  lines: Line[];
  priority: boolean;
  ready_at: Date;
  services: string[];
  store_code: string;
}

const hoursBetween = (from: Date, to: Date) =>
  Math.round(((to.getTime() - from.getTime()) / HOUR_MS) * 10) / 10;

const distinct = (values: (string | null)[]) => [
  ...new Set(values.filter((value): value is string => value !== null)),
];

// Nearest rank, so every figure shown is a turnaround an Item really had.
function nearestRank(sorted: number[], p: number) {
  return sorted[Math.ceil((p / 100) * sorted.length) - 1];
}

export function percentiles(hours: number[]) {
  if (hours.length < TURNAROUND_MIN_ITEMS) {
    return { p75: null, p90: null, p99: null };
  }
  const sorted = [...hours].sort((a, b) => a - b);
  return {
    p75: nearestRank(sorted, 75),
    p90: nearestRank(sorted, 90),
    p99: nearestRank(sorted, 99),
  };
}

// An Item still has a line in the workshop until every first-round line has
// been ready once; such an Item is left out rather than counted as slow.
export function groupItems(lines: Line[], range: { start: Date; end: Date }) {
  const byItem = new Map<number, Line[]>();
  for (const line of lines) {
    const itemLines = byItem.get(line.item_id);
    if (itemLines) {
      itemLines.push(line);
    } else {
      byItem.set(line.item_id, [line]);
    }
  }

  const groups: ItemGroup[] = [];
  for (const itemLines of byItem.values()) {
    const readyTimes = itemLines.map((line) => line.ready_at);
    if (readyTimes.some((at) => at === null)) {
      continue;
    }
    const readyAt = new Date(
      Math.max(...readyTimes.map((at) => (at as Date).getTime()))
    );
    if (readyAt < range.start || readyAt >= range.end) {
      continue;
    }
    const queuedAt = new Date(
      Math.min(...itemLines.map((line) => line.order_created_at.getTime()))
    );
    groups.push({
      categories: distinct(itemLines.map((line) => line.category_name)),
      hours: hoursBetween(queuedAt, readyAt),
      lines: itemLines,
      priority: itemLines.some((line) => line.is_priority),
      ready_at: readyAt,
      services: distinct(itemLines.map((line) => line.service_name)),
      store_code: itemLines[0].store_code,
    });
  }
  return groups;
}

// Only lines of the counted Items, so the split describes the same Items as
// the percentiles beside it.
function summariseBreakdown(lines: Line[]): Breakdown {
  const queued: number[] = [];
  const inProgress: number[] = [];
  const waitingQc: number[] = [];
  for (const line of lines) {
    const { processing_at: processingAt, ready_at: readyAt } = line;
    if (processingAt === null || readyAt === null) {
      continue;
    }
    const shelf = Math.round(line.waiting_qc_hours * 10) / 10;
    queued.push(hoursBetween(line.order_created_at, processingAt));
    // The bench work and any redo after a QC reject; the shelf time is its own part.
    inProgress.push(
      Math.max(
        Math.round((hoursBetween(processingAt, readyAt) - shelf) * 10) / 10,
        0
      )
    );
    waitingQc.push(shelf);
  }
  return {
    queued_p75: percentiles(queued).p75,
    in_progress_p75: percentiles(inProgress).p75,
    waiting_qc_p75: percentiles(waitingQc).p75,
  };
}

function buildRow(
  name: string,
  groups: ItemGroup[],
  lines: Line[]
): TurnaroundRow {
  return {
    name,
    items: groups.length,
    ...percentiles(groups.map((group) => group.hours)),
    breakdown: summariseBreakdown(lines),
  };
}

export async function getTurnaroundReport(query: GetReportRangeQuery) {
  const range = getJakartaRange(query.from, query.to);
  const lines = await listTurnaroundLines({
    range,
    storeId: query.store_id,
  });
  const groups = groupItems(lines, range);

  const byCategory = new Map<string, { groups: ItemGroup[]; lines: Line[] }>();
  for (const group of groups) {
    for (const name of group.categories) {
      const entry = byCategory.get(name) ?? { groups: [], lines: [] };
      entry.groups.push(group);
      byCategory.set(name, entry);
    }
    for (const line of group.lines) {
      if (line.category_name !== null) {
        byCategory.get(line.category_name)?.lines.push(line);
      }
    }
  }
  const categoryRows = [...byCategory].map(([name, entry]) =>
    buildRow(name, entry.groups, entry.lines)
  );
  categoryRows.sort(
    (a, b) => b.items - a.items || a.name.localeCompare(b.name)
  );

  const items: TurnaroundItem[] = groups.map((group) => ({
    hours: group.hours,
    ready_day: jakartaDayOf(group.ready_at),
    store_code: group.store_code,
    priority: group.priority,
    categories: group.categories,
    services: group.services,
  }));

  return {
    from: query.from,
    to: query.to,
    store_id: query.store_id ?? null,
    items,
    min_items: TURNAROUND_MIN_ITEMS,
    rows: [
      buildRow(
        ALL_ITEMS,
        groups,
        groups.flatMap((group) => group.lines)
      ),
      ...categoryRows,
    ],
  };
}
