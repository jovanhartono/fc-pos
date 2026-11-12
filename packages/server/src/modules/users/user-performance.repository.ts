import { and, count, eq, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import {
  itemsTable,
  orderPickupEventsTable,
  orderPickupNoticesTable,
  orderServiceStatusLogsTable,
  ordersTable,
  shiftsTable,
} from "@/db/schema";
import { timeWindow } from "@/modules/reports/money-basis";
import { qualityCheckInRange } from "@/modules/reports/quality.repository";
import {
  type DateRange,
  jakartaBucketExpr,
} from "@/modules/reports/report-range.util";

const notCancelled = ne(ordersTable.status, "cancelled");

export function countOrdersCreatedBy(userId: number, range: DateRange) {
  return db.$count(
    ordersTable,
    and(
      eq(ordersTable.created_by, userId),
      notCancelled,
      ...timeWindow(ordersTable.created_at, range)
    )
  );
}

export function countPickupsHandedOverBy(userId: number, range: DateRange) {
  return db.$count(
    orderPickupEventsTable,
    and(
      eq(orderPickupEventsTable.picked_up_by, userId),
      ...timeWindow(orderPickupEventsTable.picked_up_at, range)
    )
  );
}

export function countPickupNoticesSentBy(userId: number, range: DateRange) {
  return db.$count(
    orderPickupNoticesTable,
    and(
      eq(orderPickupNoticesTable.sent_by, userId),
      ...timeWindow(orderPickupNoticesTable.sent_at, range)
    )
  );
}

export async function countShiftDays(userId: number, range: DateRange) {
  const [row] = await db
    .select({
      days: sql<number>`COUNT(DISTINCT ${jakartaBucketExpr(shiftsTable.clock_in_at, "day")})::int`,
    })
    .from(shiftsTable)
    .where(
      and(
        eq(shiftsTable.user_id, userId),
        ...timeWindow(shiftsTable.clock_in_at, range)
      )
    );
  return row?.days ?? 0;
}

const qcLog = alias(orderServiceStatusLogsTable, "qc_log");

export async function countQcChecksDoneBy(userId: number, range: DateRange) {
  const [row] = await db
    .select({ checks: count() })
    .from(qcLog)
    .where(
      and(eq(qcLog.changed_by, userId), qualityCheckInRange(qcLog, { range }))
    );
  return row?.checks ?? 0;
}

export async function countCollectedBy(userId: number, range: DateRange) {
  const [row] = await db
    .select({
      orders: sql<number>`COUNT(DISTINCT ${ordersTable.id})::int`,
      items: sql<number>`COUNT(${itemsTable.id})::int`,
    })
    .from(ordersTable)
    .leftJoin(itemsTable, eq(itemsTable.order_id, ordersTable.id))
    .where(
      and(
        eq(ordersTable.collected_by, userId),
        notCancelled,
        ...timeWindow(ordersTable.created_at, range)
      )
    );
  return { orders: row?.orders ?? 0, items: row?.items ?? 0 };
}
