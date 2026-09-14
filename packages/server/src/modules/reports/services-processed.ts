import { and, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  orderServiceStatusLogsTable,
  ordersServicesTable,
  ordersTable,
} from "@/db/schema";
import { type RangeArgs, storeScope } from "@/modules/reports/money-basis";

// A treatment is processed the first time it reaches quality check, and counts
// once. A line checked in July and sent back for a redo in August is July's
// work, so the stretch is tested against that first check rather than against
// every log row the redo left behind.
export function listServicesProcessed({ range, storeId }: RangeArgs) {
  const firstReachedQc =
    sql`MIN(${orderServiceStatusLogsTable.created_at})`.mapWith(
      orderServiceStatusLogsTable.created_at
    );
  // Both bounds go through the column's own encoder; a bare Date would be
  // written in whatever clock the server happens to run on and slide the month.
  const from = sql.param(range.start, orderServiceStatusLogsTable.created_at);
  const to = sql.param(range.end, orderServiceStatusLogsTable.created_at);

  return db
    .select({
      order_service_id: orderServiceStatusLogsTable.order_service_id,
      processed_at: firstReachedQc.as("processed_at"),
    })
    .from(orderServiceStatusLogsTable)
    .innerJoin(
      ordersServicesTable,
      eq(orderServiceStatusLogsTable.order_service_id, ordersServicesTable.id)
    )
    .innerJoin(ordersTable, eq(ordersServicesTable.order_id, ordersTable.id))
    .where(
      and(
        eq(orderServiceStatusLogsTable.to_status, "quality_check"),
        // Nothing logged after the stretch can be a line's first check, so one
        // month's answer need not read back through the shop's whole history.
        lt(orderServiceStatusLogsTable.created_at, range.end),
        storeScope(ordersTable.store_id, storeId)
      )
    )
    .groupBy(orderServiceStatusLogsTable.order_service_id)
    .having(and(gte(firstReachedQc, from), lt(firstReachedQc, to)));
}

export async function countServicesProcessed(args: RangeArgs) {
  const [row] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(listServicesProcessed(args).as("services_processed"));

  return Number(row?.count ?? 0);
}
