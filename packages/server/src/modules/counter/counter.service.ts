import {
  listLatestQcRejects,
  listPickupShelf,
  listUndecidedComplaints,
  listWaitingLines,
  sumPickupShelf,
} from "@/modules/counter/counter.repository";
import {
  type Counter,
  type CounterCategory,
  type CounterEstimate,
  type CounterShelfOrder,
  type CounterWorkshop,
  type GetPickupShelfQuery,
  SHELF_PAGE_SIZE,
} from "@/modules/counter/counter.schema";
import { isWaitingQcOnly } from "@/modules/orders/order-status-machine";
import {
  DAY_MS,
  daysBetween,
  jakartaDayOf,
} from "@/modules/reports/report-range.util";
import { listTurnaroundLines } from "@/modules/reports/turnaround.repository";
import { groupItems, percentiles } from "@/modules/reports/turnaround.service";
import {
  buildPaginationMeta,
  normalizePagination,
  type PaginationMeta,
} from "@/utils/pagination";

const RECENT_DAYS = 14;
const WIDER_DAYS = 28;
type WaitingLine = Awaited<ReturnType<typeof listWaitingLines>>[number];

// Calendar days in Jakarta: ready at 20:00 last night is "1 day" at 09:00.
const daysSince = (at: Date, now: Date) =>
  Math.max(0, daysBetween(jakartaDayOf(at), jakartaDayOf(now)) - 1);

// ADR-0027: the cashier promises a date 9 in 10 recent shoes made.
async function getReadyEstimates(storeId: number, now: Date) {
  const wider = {
    end: now,
    start: new Date(now.getTime() - WIDER_DAYS * DAY_MS),
  };
  const recentStart = new Date(now.getTime() - RECENT_DAYS * DAY_MS);
  const items = groupItems(
    await listTurnaroundLines({ range: wider, storeId }),
    wider
  );

  const itemsByCategory = Map.groupBy(
    items.flatMap((item) =>
      [...new Set(item.lines.map((line) => line.category_id))]
        .filter((categoryId) => categoryId !== null)
        .map((categoryId) => ({ categoryId, item }))
    ),
    (entry) => entry.categoryId
  );

  const estimates = new Map<number, CounterEstimate>();
  for (const [categoryId, entries] of itemsByCategory) {
    const recent = entries.filter(
      (entry) => entry.item.ready_at >= recentStart
    );
    const p90 =
      percentiles(recent.map((entry) => entry.item.hours)).p90 ??
      percentiles(entries.map((entry) => entry.item.hours)).p90;
    if (p90 === null) {
      continue;
    }
    estimates.set(categoryId, { days: Math.max(1, Math.ceil(p90 / 24)) });
  }
  return estimates;
}

// Each Item once: a cleaned shoe whose Repaint still waits is in progress; it
// is Waiting QC only when nothing is left but the check.
const countStages = (lines: WaitingLine[]): CounterWorkshop => {
  const stages = { in_progress: 0, queued: 0, waiting_qc: 0 };
  for (const itemLines of Map.groupBy(lines, (line) => line.item_id).values()) {
    if (isWaitingQcOnly(itemLines)) {
      stages.waiting_qc++;
    } else if (itemLines.some((line) => line.status !== "queued")) {
      stages.in_progress++;
    } else {
      stages.queued++;
    }
  }
  return stages;
};

function buildCategories(
  lines: WaitingLine[],
  estimates: Map<number, CounterEstimate>
) {
  return [...Map.groupBy(lines, (line) => line.category_id).entries()]
    .map(
      ([categoryId, categoryLines]): CounterCategory => ({
        after_clean: categoryLines[0].starts_after_cleaning,
        category_id: categoryId,
        estimate: estimates.get(categoryId) ?? null,
        ...countStages(categoryLines),
        items_waiting: new Set(categoryLines.map((line) => line.item_id)).size,
        name: categoryLines[0].category_name,
      })
    )
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
  const [estimates, lines, complaints, shelf] = await Promise.all([
    getReadyEstimates(storeId, now),
    listWaitingLines(storeId),
    listUndecidedComplaints(storeId),
    sumPickupShelf(storeId),
  ]);

  const qcRejects = await buildQcRejects(lines, now);

  return {
    categories: buildCategories(lines, estimates),
    complaints: complaints.map((complaint) => ({
      category: complaint.category_name,
      complaint_id: complaint.complaint_id,
      days: daysSince(complaint.created_at, now),
      item_code: complaint.item_code,
      reason: complaint.reason,
    })),
    pickup_shelf: shelf,
    qc_rejects: qcRejects,
    // Whole Items, so a shoe with a clean and a Repaint counts once.
    workshop: countStages(lines),
  };
}

// The shelf Orders waiting longest first, a page at a time.
export async function getPickupShelf(
  query: GetPickupShelfQuery,
  now = new Date()
): Promise<{ items: CounterShelfOrder[]; meta: PaginationMeta }> {
  const pagination = normalizePagination({
    limit: SHELF_PAGE_SIZE,
    offset: query.offset,
  });
  const [rows, { orders: total }] = await Promise.all([
    listPickupShelf(query.store_id, pagination),
    sumPickupShelf(query.store_id),
  ]);

  return {
    items: rows.map((order) => ({
      customer_name: order.customer_name,
      customer_phone: order.customer_phone,
      items: order.items,
      notified: order.notified,
      order_id: order.order_id,
      ready_days: order.ready_at ? daysSince(order.ready_at, now) : 0,
    })),
    meta: buildPaginationMeta(total, pagination),
  };
}
