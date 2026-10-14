import {
  findFirstOrderCreatedAt,
  listLatestQcRejects,
  listPickupShelf,
  listProcessedByCategory,
  listUndecidedComplaints,
  listWaitingLines,
} from "@/modules/counter/counter.repository";
import type {
  Counter,
  CounterCategory,
  CounterWorkshop,
} from "@/modules/counter/counter.schema";
import {
  DAY_MS,
  daysBetween,
  getJakartaRange,
  jakartaDayOf,
  shiftDate,
} from "@/modules/reports/report-range.util";

const MIN_HISTORY_DAYS = 14;
const PACE_WINDOW_DAYS = 28;
const PACE_OPEN_DAYS = 7;
const PACE_MIN_CHECKS = 7;
const SHELF_LIMIT = 10;
type WaitingLine = Awaited<ReturnType<typeof listWaitingLines>>[number];

// Calendar days in Jakarta: ready at 20:00 last night is "1 day" at 09:00.
const daysSince = (at: Date, now: Date) =>
  Math.max(0, daysBetween(jakartaDayOf(at), jakartaDayOf(now)) - 1);

// The pace each Category can be quoted at, per open day. A Category with no
// entry gets no quote: "ready in 42 days" off two checks is a guess, and the
// counter promises what it says to a customer standing there.
async function getCategoryPaces(storeId: number, now: Date) {
  const paces = new Map<number, number>();

  // Today is left out: at 10am the workshop has had a few hours, and counting
  // that part-day would quote a queue far slower than it really is.
  const today = jakartaDayOf(now);
  const [firstOrderAt, processed] = await Promise.all([
    findFirstOrderCreatedAt(storeId),
    listProcessedByCategory(
      storeId,
      getJakartaRange(shiftDate(today, -PACE_WINDOW_DAYS), shiftDate(today, -1))
    ),
  ]);
  if (
    !firstOrderAt ||
    now.getTime() - firstOrderAt.getTime() < MIN_HISTORY_DAYS * DAY_MS
  ) {
    return paces;
  }

  // A check at 06:00 belongs to that Jakarta morning, not the previous UTC day.
  const perCategoryPerDay = new Map<number, Map<string, number>>();
  const openDays = new Set<string>();
  for (const { category_id, processed_at } of processed) {
    const day = jakartaDayOf(processed_at);
    openDays.add(day);
    const days = perCategoryPerDay.get(category_id) ?? new Map();
    days.set(day, (days.get(day) ?? 0) + 1);
    perCategoryPerDay.set(category_id, days);
  }

  // A day with no check at the Store at all is a closed day (a public
  // holiday), not a slow one, so it drops out instead of dragging the pace down.
  const newestFirst = [...openDays].sort((a, b) => b.localeCompare(a));
  if (newestFirst.length < PACE_OPEN_DAYS) {
    return paces;
  }

  for (const [categoryId, days] of perCategoryPerDay) {
    let checks = 0;
    for (const [index, day] of newestFirst.entries()) {
      checks += days.get(day) ?? 0;
      const used = index + 1;
      if (used >= PACE_OPEN_DAYS && checks >= PACE_MIN_CHECKS) {
        paces.set(categoryId, checks / used);
        break;
      }
    }
  }

  return paces;
}

// Each Item once: a shoe being cleaned while its Repaint waits is in progress,
// so queued + in progress is the number of shoes in the workshop.
const countStages = (lines: WaitingLine[]): CounterWorkshop => {
  const inProgress = new Set(
    lines.filter((line) => line.status !== "queued").map((line) => line.item_id)
  );
  const queued = new Set(
    lines
      .filter((line) => !inProgress.has(line.item_id))
      .map((line) => line.item_id)
  );
  return { in_progress: inProgress.size, queued: queued.size };
};

function buildCategories(lines: WaitingLine[], paces: Map<number, number>) {
  return [...Map.groupBy(lines, (line) => line.category_id).entries()]
    .map(([categoryId, categoryLines]): CounterCategory => {
      const pace = paces.get(categoryId);
      const low =
        pace === undefined
          ? null
          : Math.max(1, Math.floor(categoryLines.length / pace));

      return {
        after_clean: categoryLines[0].starts_after_cleaning,
        category_id: categoryId,
        estimate: low === null ? null : { days_high: low + 1, days_low: low },
        ...countStages(categoryLines),
        items_waiting: new Set(categoryLines.map((line) => line.item_id)).size,
        name: categoryLines[0].category_name,
      };
    })
    .sort(
      (a, b) =>
        b.items_waiting - a.items_waiting || a.name.localeCompare(b.name)
    );
}

async function buildQcRejects(lines: WaitingLine[], now: Date) {
  const rejected = lines.filter((line) => line.status === "qc_reject");
  if (rejected.length === 0) {
    return [];
  }

  const latest = new Map(
    (await listLatestQcRejects(rejected.map((line) => line.line_id))).map(
      (reject) => [reject.line_id, reject]
    )
  );

  return rejected
    .map((line) => {
      const reject = latest.get(line.line_id);
      return {
        category: line.category_name,
        days: reject ? daysSince(reject.created_at, now) : 0,
        item_code: line.item_code,
        note: reject?.note ?? null,
        order_id: line.order_id,
        order_service_id: line.line_id,
      };
    })
    .sort((a, b) => b.days - a.days);
}

// What one Store looks like right now, for whoever stands at its Counter.
export async function getCounter(
  storeId: number,
  now = new Date()
): Promise<Counter> {
  const [paces, lines, complaints, shelf] = await Promise.all([
    getCategoryPaces(storeId, now),
    listWaitingLines(storeId),
    listUndecidedComplaints(storeId),
    listPickupShelf(storeId),
  ]);

  const qcRejects = await buildQcRejects(lines, now);

  return {
    categories: buildCategories(lines, paces),
    complaints: complaints.map((complaint) => ({
      category: complaint.category_name,
      complaint_id: complaint.complaint_id,
      days: daysSince(complaint.created_at, now),
      item_code: complaint.item_code,
      reason: complaint.reason,
    })),
    pickup_shelf: {
      items: shelf.reduce((total, order) => total + order.items, 0),
      oldest: shelf.slice(0, SHELF_LIMIT).map((order) => ({
        customer_name: order.customer_name,
        customer_phone: order.customer_phone,
        items: order.items,
        order_id: order.order_id,
        ready_days: order.ready_at ? daysSince(order.ready_at, now) : 0,
      })),
      orders: shelf.length,
    },
    qc_rejects: qcRejects,
    // Whole Items, so a shoe with a clean and a Repaint counts once.
    workshop: countStages(lines),
  };
}
