import { and, eq, isNull, notInArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  categoriesTable,
  itemsTable,
  orderServiceStatusLogsTable,
  ordersServicesTable,
  ordersTable,
  servicesTable,
  storesTable,
} from "@/db/schema";
import {
  type RangeArgs,
  storeScope,
  timeWindow,
} from "@/modules/reports/money-basis";

const logs = orderServiceStatusLogsTable;

// Each status change of one line, read once: when the next later change came
// (two changes in the same instant don't end each other), and when the line
// was first ready.
const history = db
  .select({
    created_at: logs.created_at,
    first_ready_at:
      sql`MIN(${logs.created_at}) FILTER (WHERE ${logs.to_status} = 'ready_for_pickup') OVER ()`.as(
        "first_ready_at"
      ),
    next_at:
      sql`MIN(${logs.created_at}) OVER (ORDER BY ${logs.created_at} RANGE BETWEEN CURRENT ROW AND UNBOUNDED FOLLOWING EXCLUDE GROUP)`.as(
        "next_at"
      ),
    to_status: logs.to_status,
  })
  .from(logs)
  .where(eq(logs.order_service_id, ordersServicesTable.id))
  .as("history");

// A line sent back and redone keeps the moment it was first ready, which is
// when the Customer could have collected. Shelf time counts every stretch on
// the QC shelf before that, a wait after a QC reject included.
const timeline = db
  .select({
    processing_at:
      sql<Date | null>`MIN(${history.created_at}) FILTER (WHERE ${history.to_status} = 'processing')`
        .mapWith(logs.created_at)
        .as("processing_at"),
    ready_at: sql<Date | null>`MIN(${history.first_ready_at})`
      .mapWith(logs.created_at)
      .as("ready_at"),
    waiting_qc_hours:
      sql<number>`COALESCE(SUM(EXTRACT(EPOCH FROM (${history.next_at} - ${history.created_at}))) FILTER (WHERE ${history.to_status} = 'waiting_qc' AND ${history.created_at} < ${history.first_ready_at}), 0) / 3600`
        .mapWith(Number)
        .as("waiting_qc_hours"),
  })
  .from(history)
  .as("timeline");

// Every first-round line of every Item that had a line become ready in the
// stretch. An Item's ready day is its last line's, so any Item that lands in
// the stretch has at least one line in it.
export async function listTurnaroundLines({ range, storeId }: RangeArgs) {
  const readyInRange = db
    .selectDistinct({ item_id: ordersServicesTable.item_id })
    .from(ordersServicesTable)
    .innerJoin(ordersTable, eq(ordersServicesTable.order_id, ordersTable.id))
    .innerJoin(logs, eq(logs.order_service_id, ordersServicesTable.id))
    .where(
      and(
        eq(logs.to_status, "ready_for_pickup"),
        ...timeWindow(logs.created_at, range),
        storeScope(ordersTable.store_id, storeId)
      )
    )
    .as("ready_in_range");

  return await db
    .select({
      item_id: ordersServicesTable.item_id,
      is_priority: ordersServicesTable.is_priority,
      category_id: categoriesTable.id,
      category_name: categoriesTable.name,
      service_name: servicesTable.name,
      store_code: storesTable.code,
      order_created_at: ordersTable.created_at,
      processing_at: timeline.processing_at,
      ready_at: timeline.ready_at,
      waiting_qc_hours: timeline.waiting_qc_hours,
    })
    .from(ordersServicesTable)
    .innerJoin(
      readyInRange,
      eq(ordersServicesTable.item_id, readyInRange.item_id)
    )
    .innerJoin(itemsTable, eq(ordersServicesTable.item_id, itemsTable.id))
    .innerJoin(ordersTable, eq(ordersServicesTable.order_id, ordersTable.id))
    .innerJoin(storesTable, eq(ordersTable.store_id, storesTable.id))
    .leftJoin(
      servicesTable,
      eq(ordersServicesTable.service_id, servicesTable.id)
    )
    .leftJoin(
      categoriesTable,
      eq(servicesTable.category_id, categoriesTable.id)
    )
    .crossJoinLateral(timeline)
    .where(
      and(
        isNull(ordersServicesTable.complaint_id),
        notInArray(ordersServicesTable.status, ["refunded", "cancelled"])
      )
    );
}
