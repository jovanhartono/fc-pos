import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  orderPickupEventsTable,
  orderServiceStatusLogsTable,
  ordersServicesTable,
  ordersTable,
} from "@/db/schema";

const ITEM_PROCESSED_STATUSES = ["ready_for_pickup", "quality_check"] as const;

interface DateRange {
  start: Date;
  end: Date;
}

export async function sumDailyRevenue({
  range,
  storeId,
}: {
  range: DateRange;
  storeId?: number;
}) {
  const conditions = [
    gte(ordersTable.paid_at, range.start),
    lt(ordersTable.paid_at, range.end),
  ];
  if (storeId !== undefined) {
    conditions.push(eq(ordersTable.store_id, storeId));
  }

  const [row] = await db
    .select({
      revenue: sql<string>`COALESCE(SUM(${ordersTable.paid_amount} - ${ordersTable.refunded_amount}), 0)`,
    })
    .from(ordersTable)
    .where(and(...conditions));

  return Number(row?.revenue ?? 0);
}

export async function countDailyItemsProcessed({
  range,
  storeId,
}: {
  range: DateRange;
  storeId?: number;
}) {
  const conditions = [
    inArray(orderServiceStatusLogsTable.to_status, [
      ...ITEM_PROCESSED_STATUSES,
    ]),
    gte(orderServiceStatusLogsTable.created_at, range.start),
    lt(orderServiceStatusLogsTable.created_at, range.end),
  ];
  if (storeId !== undefined) {
    conditions.push(eq(ordersTable.store_id, storeId));
  }

  const [row] = await db
    .select({
      count: sql<number>`COUNT(DISTINCT ${orderServiceStatusLogsTable.order_service_id})::int`,
    })
    .from(orderServiceStatusLogsTable)
    .innerJoin(
      ordersServicesTable,
      eq(orderServiceStatusLogsTable.order_service_id, ordersServicesTable.id)
    )
    .innerJoin(ordersTable, eq(ordersServicesTable.order_id, ordersTable.id))
    .where(and(...conditions));

  return Number(row?.count ?? 0);
}

export async function countDailyOrdersIn({
  range,
  storeId,
}: {
  range: DateRange;
  storeId?: number;
}) {
  const conditions = [
    gte(ordersTable.created_at, range.start),
    lt(ordersTable.created_at, range.end),
  ];
  if (storeId !== undefined) {
    conditions.push(eq(ordersTable.store_id, storeId));
  }

  const [row] = await db
    .select({
      count: sql<number>`COUNT(*)::int`,
    })
    .from(ordersTable)
    .where(and(...conditions));

  return Number(row?.count ?? 0);
}

export async function countDailyOrdersOut({
  range,
  storeId,
}: {
  range: DateRange;
  storeId?: number;
}) {
  const conditions = [
    gte(orderPickupEventsTable.picked_up_at, range.start),
    lt(orderPickupEventsTable.picked_up_at, range.end),
  ];
  if (storeId !== undefined) {
    conditions.push(eq(ordersTable.store_id, storeId));
  }

  const [row] = await db
    .select({
      count: sql<number>`COUNT(DISTINCT ${orderPickupEventsTable.order_id})::int`,
    })
    .from(orderPickupEventsTable)
    .innerJoin(ordersTable, eq(orderPickupEventsTable.order_id, ordersTable.id))
    .where(and(...conditions));

  return Number(row?.count ?? 0);
}
