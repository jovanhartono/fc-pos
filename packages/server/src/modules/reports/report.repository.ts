import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  categoriesTable,
  orderPickupEventsTable,
  orderRefundsTable,
  orderServiceStatusLogsTable,
  ordersServicesTable,
  ordersTable,
  servicesTable,
  storesTable,
} from "@/db/schema";

const ITEM_PROCESSED_STATUSES = ["ready_for_pickup", "quality_check"] as const;
const JAKARTA_DAY_SQL = sql.raw(`'Asia/Jakarta'`);

interface DateRange {
  start: Date;
  end: Date;
}

export async function sumDailyPaid({
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
      paid: sql<string>`COALESCE(SUM(${ordersTable.paid_amount}), 0)`,
    })
    .from(ordersTable)
    .where(and(...conditions));

  return Number(row?.paid ?? 0);
}

export async function sumDailyRefunds({
  range,
  storeId,
}: {
  range: DateRange;
  storeId?: number;
}) {
  const conditions = [
    gte(orderRefundsTable.created_at, range.start),
    lt(orderRefundsTable.created_at, range.end),
  ];
  if (storeId !== undefined) {
    conditions.push(eq(ordersTable.store_id, storeId));
  }

  const [row] = await db
    .select({
      refunded: sql<string>`COALESCE(SUM(${orderRefundsTable.total_amount}), 0)`,
    })
    .from(orderRefundsTable)
    .innerJoin(ordersTable, eq(orderRefundsTable.order_id, ordersTable.id))
    .where(and(...conditions));

  return Number(row?.refunded ?? 0);
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

export async function ordersInTrendSeries({
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

  const dayExpr = sql<string>`to_char(${ordersTable.created_at} AT TIME ZONE ${JAKARTA_DAY_SQL}, 'YYYY-MM-DD')`;

  const rows = await db
    .select({
      day: dayExpr,
      orders_in: sql<number>`COUNT(*)::int`,
    })
    .from(ordersTable)
    .where(and(...conditions))
    .groupBy(dayExpr);

  return rows.map((row) => ({
    day: row.day,
    orders_in: Number(row.orders_in),
  }));
}

export async function paidTrendSeries({
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

  const dayExpr = sql<string>`to_char(${ordersTable.paid_at} AT TIME ZONE ${JAKARTA_DAY_SQL}, 'YYYY-MM-DD')`;

  const rows = await db
    .select({
      day: dayExpr,
      paid: sql<string>`COALESCE(SUM(${ordersTable.paid_amount}), 0)`,
    })
    .from(ordersTable)
    .where(and(...conditions))
    .groupBy(dayExpr);

  return rows.map((row) => ({
    day: row.day,
    paid: Number(row.paid),
  }));
}

export async function refundsTrendSeries({
  range,
  storeId,
}: {
  range: DateRange;
  storeId?: number;
}) {
  const conditions = [
    gte(orderRefundsTable.created_at, range.start),
    lt(orderRefundsTable.created_at, range.end),
  ];
  if (storeId !== undefined) {
    conditions.push(eq(ordersTable.store_id, storeId));
  }

  const dayExpr = sql<string>`to_char(${orderRefundsTable.created_at} AT TIME ZONE ${JAKARTA_DAY_SQL}, 'YYYY-MM-DD')`;

  const rows = await db
    .select({
      day: dayExpr,
      refunded: sql<string>`COALESCE(SUM(${orderRefundsTable.total_amount}), 0)`,
    })
    .from(orderRefundsTable)
    .innerJoin(ordersTable, eq(orderRefundsTable.order_id, ordersTable.id))
    .where(and(...conditions))
    .groupBy(dayExpr);

  return rows.map((row) => ({
    day: row.day,
    refunded: Number(row.refunded),
  }));
}

export async function ordersOutTrendSeries({
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

  const dayExpr = sql<string>`to_char(${orderPickupEventsTable.picked_up_at} AT TIME ZONE ${JAKARTA_DAY_SQL}, 'YYYY-MM-DD')`;

  const rows = await db
    .select({
      day: dayExpr,
      orders_out: sql<number>`COUNT(DISTINCT ${orderPickupEventsTable.order_id})::int`,
    })
    .from(orderPickupEventsTable)
    .innerJoin(ordersTable, eq(orderPickupEventsTable.order_id, ordersTable.id))
    .where(and(...conditions))
    .groupBy(dayExpr);

  return rows.map((row) => ({
    day: row.day,
    orders_out: Number(row.orders_out),
  }));
}

export async function categoryRevenueForRange({
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

  const rows = await db
    .select({
      category_id: categoriesTable.id,
      category_name: categoriesTable.name,
      revenue: sql<string>`COALESCE(SUM(${ordersServicesTable.subtotal}), 0)`,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(ordersServicesTable)
    .innerJoin(ordersTable, eq(ordersServicesTable.order_id, ordersTable.id))
    .innerJoin(
      servicesTable,
      eq(ordersServicesTable.service_id, servicesTable.id)
    )
    .innerJoin(
      categoriesTable,
      eq(servicesTable.category_id, categoriesTable.id)
    )
    .where(and(...conditions))
    .groupBy(categoriesTable.id, categoriesTable.name)
    .orderBy(desc(sql`COALESCE(SUM(${ordersServicesTable.subtotal}), 0)`));

  return rows.map((row) => ({
    category_id: row.category_id,
    category_name: row.category_name,
    revenue: Number(row.revenue),
    count: Number(row.count),
  }));
}

export async function topServicesForRange({
  range,
  storeId,
  limit = 5,
}: {
  range: DateRange;
  storeId?: number;
  limit?: number;
}) {
  const conditions = [
    gte(ordersTable.created_at, range.start),
    lt(ordersTable.created_at, range.end),
  ];
  if (storeId !== undefined) {
    conditions.push(eq(ordersTable.store_id, storeId));
  }

  const rows = await db
    .select({
      service_id: ordersServicesTable.service_id,
      service_name: servicesTable.name,
      count: sql<number>`COUNT(*)::int`,
      revenue: sql<string>`COALESCE(SUM(${ordersServicesTable.subtotal}), 0)`,
    })
    .from(ordersServicesTable)
    .innerJoin(ordersTable, eq(ordersServicesTable.order_id, ordersTable.id))
    .innerJoin(
      servicesTable,
      eq(ordersServicesTable.service_id, servicesTable.id)
    )
    .where(and(...conditions))
    .groupBy(ordersServicesTable.service_id, servicesTable.name)
    .orderBy(desc(sql`COUNT(*)`))
    .limit(limit);

  return rows.map((row) => ({
    service_id: row.service_id ?? 0,
    service_name: row.service_name ?? "Unknown",
    count: Number(row.count),
    revenue: Number(row.revenue),
  }));
}

export async function perStoreForRange({ range }: { range: DateRange }) {
  const paidRows = await db
    .select({
      store_id: ordersTable.store_id,
      paid: sql<string>`COALESCE(SUM(${ordersTable.paid_amount}), 0)`,
    })
    .from(ordersTable)
    .where(
      and(
        gte(ordersTable.paid_at, range.start),
        lt(ordersTable.paid_at, range.end)
      )
    )
    .groupBy(ordersTable.store_id);

  const refundRows = await db
    .select({
      store_id: ordersTable.store_id,
      refunded: sql<string>`COALESCE(SUM(${orderRefundsTable.total_amount}), 0)`,
    })
    .from(orderRefundsTable)
    .innerJoin(ordersTable, eq(orderRefundsTable.order_id, ordersTable.id))
    .where(
      and(
        gte(orderRefundsTable.created_at, range.start),
        lt(orderRefundsTable.created_at, range.end)
      )
    )
    .groupBy(ordersTable.store_id);

  const ordersInRows = await db
    .select({
      store_id: ordersTable.store_id,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(ordersTable)
    .where(
      and(
        gte(ordersTable.created_at, range.start),
        lt(ordersTable.created_at, range.end)
      )
    )
    .groupBy(ordersTable.store_id);

  const ordersOutRows = await db
    .select({
      store_id: ordersTable.store_id,
      count: sql<number>`COUNT(DISTINCT ${orderPickupEventsTable.order_id})::int`,
    })
    .from(orderPickupEventsTable)
    .innerJoin(ordersTable, eq(orderPickupEventsTable.order_id, ordersTable.id))
    .where(
      and(
        gte(orderPickupEventsTable.picked_up_at, range.start),
        lt(orderPickupEventsTable.picked_up_at, range.end)
      )
    )
    .groupBy(ordersTable.store_id);

  const stores = await db
    .select({
      id: storesTable.id,
      code: storesTable.code,
      name: storesTable.name,
    })
    .from(storesTable)
    .orderBy(asc(storesTable.code));

  const paidByStore = new Map<number, number>(
    paidRows.map((row) => [row.store_id, Number(row.paid)])
  );
  const refundedByStore = new Map<number, number>(
    refundRows.map((row) => [row.store_id, Number(row.refunded)])
  );
  const ordersInByStore = new Map<number, number>(
    ordersInRows.map((row) => [row.store_id, Number(row.count)])
  );
  const ordersOutByStore = new Map<number, number>(
    ordersOutRows.map((row) => [row.store_id, Number(row.count)])
  );

  return stores.map((store) => ({
    store_id: store.id,
    store_code: store.code,
    store_name: store.name,
    revenue:
      (paidByStore.get(store.id) ?? 0) - (refundedByStore.get(store.id) ?? 0),
    orders_in: ordersInByStore.get(store.id) ?? 0,
    orders_out: ordersOutByStore.get(store.id) ?? 0,
  }));
}
