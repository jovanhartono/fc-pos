import { and, asc, desc, eq, gte, lt, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  campaignsTable,
  orderPickupEventsTable,
  orderRefundsTable,
  ordersServicesTable,
  ordersTable,
  productsTable,
  servicesTable,
  storesTable,
} from "@/db/schema";

const ACTIVE_QUEUE_STATUSES = [
  "queued",
  "processing",
  "quality_check",
] as const;

const LOW_STOCK_THRESHOLD = 20;
const UNCLAIMED_CUTOFF_DAYS = 30;

interface DateRange {
  start: Date;
  end: Date;
}

export async function getEntityCounts() {
  const result = await db.execute<{
    customers: number;
    users: number;
    stores: number;
    categories: number;
    services: number;
    products: number;
    payment_methods: number;
    orders: number;
    campaigns: number;
  }>(sql`
    SELECT
      (SELECT COUNT(*)::int FROM customers) AS customers,
      (SELECT COUNT(*)::int FROM users) AS users,
      (SELECT COUNT(*)::int FROM stores) AS stores,
      (SELECT COUNT(*)::int FROM categories) AS categories,
      (SELECT COUNT(*)::int FROM services) AS services,
      (SELECT COUNT(*)::int FROM products) AS products,
      (SELECT COUNT(*)::int FROM payment_methods) AS payment_methods,
      (SELECT COUNT(*)::int FROM orders) AS orders,
      (SELECT COUNT(*)::int FROM campaigns) AS campaigns
  `);

  const row = result.rows[0];
  if (!row) {
    throw new Error("Failed to fetch dashboard counts");
  }

  return {
    customers: Number(row.customers),
    users: Number(row.users),
    stores: Number(row.stores),
    categories: Number(row.categories),
    services: Number(row.services),
    products: Number(row.products),
    paymentMethods: Number(row.payment_methods),
    orders: Number(row.orders),
    campaigns: Number(row.campaigns),
  };
}

export async function sumPaidInRange(range: DateRange) {
  const [row] = await db
    .select({
      paid: sql<string>`COALESCE(SUM(${ordersTable.paid_amount}), 0)`,
    })
    .from(ordersTable)
    .where(
      and(
        gte(ordersTable.paid_at, range.start),
        lt(ordersTable.paid_at, range.end)
      )
    );

  return Number(row?.paid ?? 0);
}

export async function sumRefundsInRange(range: DateRange) {
  const [row] = await db
    .select({
      refunded: sql<string>`COALESCE(SUM(${orderRefundsTable.total_amount}), 0)`,
    })
    .from(orderRefundsTable)
    .where(
      and(
        gte(orderRefundsTable.created_at, range.start),
        lt(orderRefundsTable.created_at, range.end)
      )
    );

  return Number(row?.refunded ?? 0);
}

export async function countOrdersInRange(range: DateRange) {
  const [row] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(ordersTable)
    .where(
      and(
        gte(ordersTable.created_at, range.start),
        lt(ordersTable.created_at, range.end)
      )
    );

  return Number(row?.count ?? 0);
}

export async function countPickupsInRange(range: DateRange) {
  const [row] = await db
    .select({
      count: sql<number>`COUNT(DISTINCT ${orderPickupEventsTable.order_id})::int`,
    })
    .from(orderPickupEventsTable)
    .where(
      and(
        gte(orderPickupEventsTable.picked_up_at, range.start),
        lt(orderPickupEventsTable.picked_up_at, range.end)
      )
    );

  return Number(row?.count ?? 0);
}

export async function countActiveQueueAtMoment(moment: Date) {
  const [row] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(ordersServicesTable)
    .innerJoin(ordersTable, eq(ordersServicesTable.order_id, ordersTable.id))
    .where(
      and(
        lte(ordersTable.created_at, moment),
        sql`${ordersServicesTable.status} IN (${sql.join(
          ACTIVE_QUEUE_STATUSES.map((status) => sql`${status}`),
          sql`, `
        )})`
      )
    );

  return Number(row?.count ?? 0);
}

export async function perStoreToday(range: DateRange) {
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

  const ordersRows = await db
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

  const queueRows = await db
    .select({
      store_id: ordersTable.store_id,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(ordersServicesTable)
    .innerJoin(ordersTable, eq(ordersServicesTable.order_id, ordersTable.id))
    .where(
      sql`${ordersServicesTable.status} IN (${sql.join(
        ACTIVE_QUEUE_STATUSES.map((status) => sql`${status}`),
        sql`, `
      )})`
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
  const ordersByStore = new Map<number, number>(
    ordersRows.map((row) => [row.store_id, Number(row.count)])
  );
  const queueByStore = new Map<number, number>(
    queueRows.map((row) => [row.store_id, Number(row.count)])
  );

  return stores.map((store) => ({
    store_id: store.id,
    store_code: store.code,
    store_name: store.name,
    revenue:
      (paidByStore.get(store.id) ?? 0) - (refundedByStore.get(store.id) ?? 0),
    orders_in: ordersByStore.get(store.id) ?? 0,
    queue_depth: queueByStore.get(store.id) ?? 0,
  }));
}

export async function topServicesInRange(range: DateRange, limit = 5) {
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
    .where(
      and(
        gte(ordersTable.created_at, range.start),
        lt(ordersTable.created_at, range.end)
      )
    )
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

export async function findOldestOpenOrder(moment: Date) {
  const [row] = await db
    .select({
      order_id: ordersTable.id,
      order_code: ordersTable.code,
      created_at: ordersTable.created_at,
    })
    .from(ordersTable)
    .where(
      and(
        sql`${ordersTable.status} IN ('created', 'processing', 'ready_for_pickup')`,
        lte(ordersTable.created_at, moment)
      )
    )
    .orderBy(asc(ordersTable.created_at))
    .limit(1);

  if (!row) {
    return null;
  }

  const hoursOpen =
    (moment.getTime() - new Date(row.created_at).getTime()) / 3_600_000;

  return {
    order_id: row.order_id,
    order_code: row.order_code,
    hours_open: Math.round(hoursOpen * 10) / 10,
  };
}

export async function countUnclaimedOrders(moment: Date) {
  const cutoff = new Date(
    moment.getTime() - UNCLAIMED_CUTOFF_DAYS * 86_400_000
  );
  const [row] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.status, "ready_for_pickup"),
        lte(ordersTable.created_at, cutoff)
      )
    );

  return Number(row?.count ?? 0);
}

export async function countLowStockProducts() {
  const [row] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(productsTable)
    .where(
      and(
        eq(productsTable.is_active, true),
        sql`${productsTable.stock} < ${LOW_STOCK_THRESHOLD}`
      )
    );

  return Number(row?.count ?? 0);
}

export async function countExpiredActiveCampaigns(moment: Date) {
  const [row] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(campaignsTable)
    .where(
      and(
        eq(campaignsTable.is_active, true),
        sql`${campaignsTable.ends_at} IS NOT NULL`,
        lt(campaignsTable.ends_at, moment)
      )
    );

  return Number(row?.count ?? 0);
}
