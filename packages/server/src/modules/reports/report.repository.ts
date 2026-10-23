import { and, asc, desc, eq, gte, lt, notInArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  categoriesTable,
  itemsTable,
  orderPickupEventsTable,
  orderRefundsTable,
  ordersServicesTable,
  ordersTable,
  servicesTable,
  storesTable,
  usersTable,
} from "@/db/schema";
import { ORDER_TERMINAL_SERVICE_STATUSES } from "@/modules/orders/order-status-machine";
import {
  collected,
  grossSales,
  paidOrderWindow,
  refunded,
  revenue,
  storeScope,
  timeWindow,
} from "@/modules/reports/money-basis";
import {
  type DateRange,
  jakartaBucketExpr,
} from "@/modules/reports/report-range.util";

export async function sumDailyPaid({
  range,
  storeId,
}: {
  range: DateRange;
  storeId?: number;
}) {
  const [row] = await db
    .select({ paid: collected() })
    .from(ordersTable)
    .where(
      and(
        ...timeWindow(ordersTable.paid_at, range),
        storeScope(ordersTable.store_id, storeId)
      )
    );

  return Number(row?.paid ?? 0);
}

export async function sumDailyRefunds({
  range,
  storeId,
}: {
  range: DateRange;
  storeId?: number;
}) {
  const [row] = await db
    .select({ refunded: refunded() })
    .from(orderRefundsTable)
    .innerJoin(ordersTable, eq(orderRefundsTable.order_id, ordersTable.id))
    .where(
      and(
        ...timeWindow(orderRefundsTable.created_at, range),
        storeScope(ordersTable.store_id, storeId)
      )
    );

  return Number(row?.refunded ?? 0);
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

  const dayExpr = jakartaBucketExpr(ordersTable.created_at, "day");

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

  const dayExpr = jakartaBucketExpr(ordersTable.paid_at, "day");

  const rows = await db
    .select({
      day: dayExpr,
      paid: collected(),
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

  const dayExpr = jakartaBucketExpr(orderRefundsTable.created_at, "day");

  const rows = await db
    .select({
      day: dayExpr,
      refunded: refunded(),
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

  const dayExpr = jakartaBucketExpr(orderPickupEventsTable.picked_up_at, "day");

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

// Counted on the day the money was taken: by Order date, a line the Customer
// pays for tomorrow landed in today's panel.
export async function categoryGrossSalesForRange({
  range,
  storeId,
}: {
  range: DateRange;
  storeId?: number;
}) {
  const rows = await db
    .select({
      category_id: categoriesTable.id,
      category_name: categoriesTable.name,
      gross_sales: grossSales(ordersServicesTable),
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
    .where(and(...paidOrderWindow({ range, storeId })))
    .groupBy(categoriesTable.id, categoriesTable.name)
    .orderBy(desc(grossSales(ordersServicesTable)));

  return rows.map((row) => ({
    category_id: row.category_id,
    category_name: row.category_name,
    gross_sales: Number(row.gross_sales),
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
  const rows = await db
    .select({
      service_id: ordersServicesTable.service_id,
      service_name: servicesTable.name,
      count: sql<number>`COUNT(*)::int`,
      gross_sales: grossSales(ordersServicesTable),
    })
    .from(ordersServicesTable)
    .innerJoin(ordersTable, eq(ordersServicesTable.order_id, ordersTable.id))
    .innerJoin(
      servicesTable,
      eq(ordersServicesTable.service_id, servicesTable.id)
    )
    .where(and(...paidOrderWindow({ range, storeId })))
    .groupBy(ordersServicesTable.service_id, servicesTable.name)
    .orderBy(desc(sql`COUNT(*)`))
    .limit(limit);

  return rows.map((row) => ({
    service_id: row.service_id ?? 0,
    service_name: row.service_name ?? "Unknown",
    count: Number(row.count),
    gross_sales: Number(row.gross_sales),
  }));
}

export async function perStoreForRange({ range }: { range: DateRange }) {
  const paidRows = await db
    .select({
      store_id: ordersTable.store_id,
      paid: collected(),
      orders: sql<number>`COUNT(*)::int`,
    })
    .from(ordersTable)
    .where(and(...timeWindow(ordersTable.paid_at, range)))
    .groupBy(ordersTable.store_id);

  const refundRows = await db
    .select({
      store_id: ordersTable.store_id,
      refunded: refunded(),
    })
    .from(orderRefundsTable)
    .innerJoin(ordersTable, eq(orderRefundsTable.order_id, ordersTable.id))
    .where(and(...timeWindow(orderRefundsTable.created_at, range)))
    .groupBy(ordersTable.store_id);

  const stores = await db
    .select({
      id: storesTable.id,
      code: storesTable.code,
      name: storesTable.name,
    })
    .from(storesTable)
    .orderBy(asc(storesTable.code));

  const paidByStore = new Map(paidRows.map((row) => [row.store_id, row]));
  const refundedByStore = new Map<number, number>(
    refundRows.map((row) => [row.store_id, Number(row.refunded)])
  );

  const rows = stores.map((store) => {
    const paid = paidByStore.get(store.id);
    return {
      store_id: store.id,
      store_code: store.code,
      store_name: store.name,
      revenue: revenue(
        Number(paid?.paid ?? 0),
        refundedByStore.get(store.id) ?? 0
      ),
      orders: Number(paid?.orders ?? 0),
    };
  });
  const total = rows.reduce((sum, row) => sum + row.revenue, 0);
  // Ranked like Financial's Store leaderboard.
  return rows
    .map((row) => ({ ...row, share: total > 0 ? row.revenue / total : 0 }))
    .sort((a, b) => b.revenue - a.revenue);
}

interface AgingQueueFilters {
  storeId?: number;
}

function buildAgingQueueWhere(filters: AgingQueueFilters) {
  const conditions = [
    notInArray(ordersServicesTable.status, [
      ...ORDER_TERMINAL_SERVICE_STATUSES,
    ]),
  ];
  if (filters.storeId !== undefined) {
    conditions.push(eq(ordersTable.store_id, filters.storeId));
  }
  return and(...conditions);
}

export async function listAgingQueue({
  filters,
  limit,
  offset,
}: {
  filters: AgingQueueFilters;
  limit: number;
  offset: number;
}) {
  const rows = await db
    .select({
      id: ordersServicesTable.id,
      order_id: ordersServicesTable.order_id,
      order_code: ordersTable.code,
      item_code: itemsTable.item_code,
      status: ordersServicesTable.status,
      service_name: servicesTable.name,
      store_id: ordersTable.store_id,
      store_code: storesTable.code,
      store_name: storesTable.name,
      handler_id: ordersServicesTable.handler_id,
      handler_name: usersTable.name,
      created_at: ordersTable.created_at,
      days_waiting: sql<number>`EXTRACT(DAY FROM NOW() - ${ordersTable.created_at})::int`,
    })
    .from(ordersServicesTable)
    .innerJoin(ordersTable, eq(ordersServicesTable.order_id, ordersTable.id))
    .innerJoin(storesTable, eq(ordersTable.store_id, storesTable.id))
    .innerJoin(
      servicesTable,
      eq(ordersServicesTable.service_id, servicesTable.id)
    )
    // The Item code lives on the Item, not the OrderService (ADR-0017).
    .innerJoin(itemsTable, eq(ordersServicesTable.item_id, itemsTable.id))
    .leftJoin(usersTable, eq(ordersServicesTable.handler_id, usersTable.id))
    .where(buildAgingQueueWhere(filters))
    .orderBy(asc(ordersTable.created_at))
    .limit(limit)
    .offset(offset);

  return rows.map((row) => ({
    ...row,
    days_waiting: Number(row.days_waiting),
  }));
}

export async function countAgingQueue(filters: AgingQueueFilters) {
  const [row] = await db
    .select({ total: sql<string>`COUNT(*)` })
    .from(ordersServicesTable)
    .innerJoin(ordersTable, eq(ordersServicesTable.order_id, ordersTable.id))
    .where(buildAgingQueueWhere(filters));

  return Number(row?.total ?? 0);
}
