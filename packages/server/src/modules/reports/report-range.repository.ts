import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  lt,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import {
  campaignsTable,
  categoriesTable,
  customersTable,
  orderCampaignsTable,
  orderPickupEventsTable,
  orderRefundItemsTable,
  orderRefundsTable,
  orderServiceStatusLogsTable,
  ordersProductsTable,
  ordersServicesTable,
  ordersTable,
  paymentMethodsTable,
  servicesTable,
  shiftsTable,
  storesTable,
  usersTable,
} from "@/db/schema";
import {
  type DateRange,
  type Granularity,
  jakartaBucketExpr,
} from "@/modules/reports/report-range.util";

interface BaseRangeArgs {
  range: DateRange;
  storeId?: number;
  granularity: Granularity;
}

// ───────────────────────── Revenue trend (R1) ─────────────────────────

export async function listServicesRevenueSeries({
  range,
  storeId,
  granularity,
}: BaseRangeArgs) {
  const bucket = jakartaBucketExpr(ordersTable.paid_at, granularity);
  const conditions = [
    gte(ordersTable.paid_at, range.start),
    lt(ordersTable.paid_at, range.end),
    isNotNull(ordersTable.paid_at),
  ];
  if (storeId !== undefined) {
    conditions.push(eq(ordersTable.store_id, storeId));
  }

  const rows = await db
    .select({
      bucket,
      revenue: sql<string>`COALESCE(SUM(${ordersServicesTable.subtotal}), 0)`,
    })
    .from(ordersServicesTable)
    .innerJoin(ordersTable, eq(ordersServicesTable.order_id, ordersTable.id))
    .where(and(...conditions))
    .groupBy(bucket);

  return rows.map((row) => ({
    bucket: row.bucket,
    revenue: Number(row.revenue),
  }));
}

export async function listProductsRevenueSeries({
  range,
  storeId,
  granularity,
}: BaseRangeArgs) {
  const bucket = jakartaBucketExpr(ordersTable.paid_at, granularity);
  const conditions = [
    gte(ordersTable.paid_at, range.start),
    lt(ordersTable.paid_at, range.end),
    isNotNull(ordersTable.paid_at),
  ];
  if (storeId !== undefined) {
    conditions.push(eq(ordersTable.store_id, storeId));
  }

  const rows = await db
    .select({
      bucket,
      revenue: sql<string>`COALESCE(SUM(${ordersProductsTable.subtotal}), 0)`,
    })
    .from(ordersProductsTable)
    .innerJoin(ordersTable, eq(ordersProductsTable.order_id, ordersTable.id))
    .where(and(...conditions))
    .groupBy(bucket);

  return rows.map((row) => ({
    bucket: row.bucket,
    revenue: Number(row.revenue),
  }));
}

// ───────────────────────── COGS (Financial) ─────────────────────────

export async function listServicesCogsSeries({
  range,
  storeId,
  granularity,
}: BaseRangeArgs) {
  const bucket = jakartaBucketExpr(ordersTable.paid_at, granularity);
  const conditions = [
    gte(ordersTable.paid_at, range.start),
    lt(ordersTable.paid_at, range.end),
    isNotNull(ordersTable.paid_at),
  ];
  if (storeId !== undefined) {
    conditions.push(eq(ordersTable.store_id, storeId));
  }

  const rows = await db
    .select({
      bucket,
      cogs: sql<string>`COALESCE(SUM(${ordersServicesTable.cogs_snapshot}), 0)`,
    })
    .from(ordersServicesTable)
    .innerJoin(ordersTable, eq(ordersServicesTable.order_id, ordersTable.id))
    .where(and(...conditions))
    .groupBy(bucket);

  return rows.map((row) => ({
    bucket: row.bucket,
    cogs: Number(row.cogs),
  }));
}

export async function listProductsCogsSeries({
  range,
  storeId,
  granularity,
}: BaseRangeArgs) {
  const bucket = jakartaBucketExpr(ordersTable.paid_at, granularity);
  const conditions = [
    gte(ordersTable.paid_at, range.start),
    lt(ordersTable.paid_at, range.end),
    isNotNull(ordersTable.paid_at),
  ];
  if (storeId !== undefined) {
    conditions.push(eq(ordersTable.store_id, storeId));
  }

  const rows = await db
    .select({
      bucket,
      cogs: sql<string>`COALESCE(SUM(${ordersProductsTable.cogs_snapshot}), 0)`,
    })
    .from(ordersProductsTable)
    .innerJoin(ordersTable, eq(ordersProductsTable.order_id, ordersTable.id))
    .where(and(...conditions))
    .groupBy(bucket);

  return rows.map((row) => ({
    bucket: row.bucket,
    cogs: Number(row.cogs),
  }));
}

// ───────────────────────── Discount (Financial) ─────────────────────────

export async function listOrderDiscountSeries({
  range,
  storeId,
  granularity,
}: BaseRangeArgs) {
  const bucket = jakartaBucketExpr(ordersTable.paid_at, granularity);
  const conditions = [
    gte(ordersTable.paid_at, range.start),
    lt(ordersTable.paid_at, range.end),
    isNotNull(ordersTable.paid_at),
  ];
  if (storeId !== undefined) {
    conditions.push(eq(ordersTable.store_id, storeId));
  }

  const rows = await db
    .select({
      bucket,
      discount: sql<string>`COALESCE(SUM(${ordersTable.discount}), 0)`,
    })
    .from(ordersTable)
    .where(and(...conditions))
    .groupBy(bucket);

  return rows.map((row) => ({
    bucket: row.bucket,
    discount: Number(row.discount),
  }));
}

// ───────────────────────── Store revenue (branch donut) ─────────────────────────

export async function listStoreRevenueRows({ range }: { range: DateRange }) {
  const conditions = [
    gte(ordersTable.paid_at, range.start),
    lt(ordersTable.paid_at, range.end),
    isNotNull(ordersTable.paid_at),
  ];

  const rows = await db
    .select({
      store_id: ordersTable.store_id,
      store_name: storesTable.name,
      store_code: storesTable.code,
      revenue: sql<string>`COALESCE(SUM(${ordersTable.paid_amount}), 0)`,
      orders: sql<number>`COUNT(*)::int`,
    })
    .from(ordersTable)
    .innerJoin(storesTable, eq(ordersTable.store_id, storesTable.id))
    .where(and(...conditions))
    .groupBy(ordersTable.store_id, storesTable.name, storesTable.code)
    .orderBy(asc(storesTable.code));

  return rows.map((row) => ({
    store_id: row.store_id,
    store_name: row.store_name,
    store_code: row.store_code,
    revenue: Number(row.revenue),
    orders: Number(row.orders),
  }));
}

// ───────────────────────── Category trend (R6) ─────────────────────────

export async function listCategoryRevenueSeries({
  range,
  storeId,
  granularity,
}: BaseRangeArgs) {
  const bucket = jakartaBucketExpr(ordersTable.paid_at, granularity);
  const conditions = [
    gte(ordersTable.paid_at, range.start),
    lt(ordersTable.paid_at, range.end),
    isNotNull(ordersTable.paid_at),
  ];
  if (storeId !== undefined) {
    conditions.push(eq(ordersTable.store_id, storeId));
  }

  const rows = await db
    .select({
      bucket,
      category_id: categoriesTable.id,
      category_name: categoriesTable.name,
      revenue: sql<string>`COALESCE(SUM(${ordersServicesTable.subtotal}), 0)`,
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
    .groupBy(bucket, categoriesTable.id, categoriesTable.name);

  return rows.map((row) => ({
    bucket: row.bucket,
    category_id: row.category_id,
    category_name: row.category_name,
    revenue: Number(row.revenue),
  }));
}

// ───────────────────────── Branch × Category revenue ─────────────────────────

export async function listStoreCategoryRevenueRows({
  range,
  storeId,
}: {
  range: DateRange;
  storeId?: number;
}) {
  const conditions = [
    gte(ordersTable.paid_at, range.start),
    lt(ordersTable.paid_at, range.end),
    isNotNull(ordersTable.paid_at),
  ];
  if (storeId !== undefined) {
    conditions.push(eq(ordersTable.store_id, storeId));
  }

  const rows = await db
    .select({
      store_id: ordersTable.store_id,
      store_name: storesTable.name,
      store_code: storesTable.code,
      category_id: categoriesTable.id,
      category_name: categoriesTable.name,
      revenue: sql<string>`COALESCE(SUM(${ordersServicesTable.subtotal}), 0)`,
    })
    .from(ordersServicesTable)
    .innerJoin(ordersTable, eq(ordersServicesTable.order_id, ordersTable.id))
    .innerJoin(storesTable, eq(ordersTable.store_id, storesTable.id))
    .innerJoin(
      servicesTable,
      eq(ordersServicesTable.service_id, servicesTable.id)
    )
    .innerJoin(
      categoriesTable,
      eq(servicesTable.category_id, categoriesTable.id)
    )
    .where(and(...conditions))
    .groupBy(
      ordersTable.store_id,
      storesTable.name,
      storesTable.code,
      categoriesTable.id,
      categoriesTable.name
    );

  return rows.map((row) => ({
    store_id: row.store_id,
    store_name: row.store_name,
    store_code: row.store_code,
    category_id: row.category_id,
    category_name: row.category_name,
    revenue: Number(row.revenue),
  }));
}

// ───────────────────────── Orders flow (R2) ─────────────────────────

export async function listOrdersInSeries({
  range,
  storeId,
  granularity,
}: BaseRangeArgs) {
  const bucket = jakartaBucketExpr(ordersTable.created_at, granularity);
  const conditions = [
    gte(ordersTable.created_at, range.start),
    lt(ordersTable.created_at, range.end),
  ];
  if (storeId !== undefined) {
    conditions.push(eq(ordersTable.store_id, storeId));
  }

  const rows = await db
    .select({
      bucket,
      orders_in: sql<number>`COUNT(*)::int`,
    })
    .from(ordersTable)
    .where(and(...conditions))
    .groupBy(bucket);

  return rows.map((row) => ({
    bucket: row.bucket,
    orders_in: Number(row.orders_in),
  }));
}

export async function listOrdersOutSeries({
  range,
  storeId,
  granularity,
}: BaseRangeArgs) {
  const bucket = jakartaBucketExpr(
    orderPickupEventsTable.picked_up_at,
    granularity
  );
  const conditions = [
    gte(orderPickupEventsTable.picked_up_at, range.start),
    lt(orderPickupEventsTable.picked_up_at, range.end),
  ];
  if (storeId !== undefined) {
    conditions.push(eq(ordersTable.store_id, storeId));
  }

  const rows = await db
    .select({
      bucket,
      orders_out: sql<number>`COUNT(DISTINCT ${orderPickupEventsTable.order_id})::int`,
    })
    .from(orderPickupEventsTable)
    .innerJoin(ordersTable, eq(orderPickupEventsTable.order_id, ordersTable.id))
    .where(and(...conditions))
    .groupBy(bucket);

  return rows.map((row) => ({
    bucket: row.bucket,
    orders_out: Number(row.orders_out),
  }));
}

export async function findDistinctHandlerCount({
  range,
  storeId,
}: {
  range: DateRange;
  storeId?: number;
}) {
  const conditions = [
    gte(orderServiceStatusLogsTable.created_at, range.start),
    lt(orderServiceStatusLogsTable.created_at, range.end),
    eq(orderServiceStatusLogsTable.to_status, "processing"),
    eq(orderServiceStatusLogsTable.from_status, "queued"),
  ];
  if (storeId !== undefined) {
    conditions.push(eq(ordersTable.store_id, storeId));
  }

  const [row] = await db
    .select({
      handlers: sql<number>`COUNT(DISTINCT ${orderServiceStatusLogsTable.changed_by})::int`,
    })
    .from(orderServiceStatusLogsTable)
    .innerJoin(
      ordersServicesTable,
      eq(orderServiceStatusLogsTable.order_service_id, ordersServicesTable.id)
    )
    .innerJoin(ordersTable, eq(ordersServicesTable.order_id, ordersTable.id))
    .where(and(...conditions));

  return Number(row?.handlers ?? 0);
}

// ───────────────────────── Payment mix (R3) ─────────────────────────

export async function listPaymentMixSeries({
  range,
  storeId,
  granularity,
}: BaseRangeArgs) {
  const bucket = jakartaBucketExpr(ordersTable.paid_at, granularity);
  const conditions = [
    gte(ordersTable.paid_at, range.start),
    lt(ordersTable.paid_at, range.end),
    isNotNull(ordersTable.paid_at),
  ];
  if (storeId !== undefined) {
    conditions.push(eq(ordersTable.store_id, storeId));
  }

  const rows = await db
    .select({
      bucket,
      payment_method_id: ordersTable.payment_method_id,
      payment_method_name: paymentMethodsTable.name,
      revenue: sql<string>`COALESCE(SUM(${ordersTable.paid_amount}), 0)`,
      orders: sql<number>`COUNT(*)::int`,
    })
    .from(ordersTable)
    .leftJoin(
      paymentMethodsTable,
      eq(ordersTable.payment_method_id, paymentMethodsTable.id)
    )
    .where(and(...conditions))
    .groupBy(bucket, ordersTable.payment_method_id, paymentMethodsTable.name);

  return rows.map((row) => ({
    bucket: row.bucket,
    payment_method_id: row.payment_method_id ?? 0,
    payment_method_name: row.payment_method_name ?? "Unknown",
    revenue: Number(row.revenue),
    orders: Number(row.orders),
  }));
}

// ───────────────────────── Customer acquisition (R4) ─────────────────────────

export async function listNewCustomersSeries({
  range,
  storeId,
  granularity,
}: BaseRangeArgs) {
  const bucket = jakartaBucketExpr(customersTable.created_at, granularity);
  const conditions = [
    gte(customersTable.created_at, range.start),
    lt(customersTable.created_at, range.end),
  ];
  if (storeId !== undefined) {
    conditions.push(eq(customersTable.origin_store_id, storeId));
  }

  const rows = await db
    .select({
      bucket,
      new_customers: sql<number>`COUNT(*)::int`,
    })
    .from(customersTable)
    .where(and(...conditions))
    .groupBy(bucket);

  return rows.map((row) => ({
    bucket: row.bucket,
    new_customers: Number(row.new_customers),
  }));
}

export async function listReturningCustomerOrdersSeries({
  range,
  storeId,
  granularity,
}: BaseRangeArgs) {
  const bucket = jakartaBucketExpr(ordersTable.created_at, granularity);
  const conditions = [
    gte(ordersTable.created_at, range.start),
    lt(ordersTable.created_at, range.end),
    isNotNull(ordersTable.customer_id),
  ];
  if (storeId !== undefined) {
    conditions.push(eq(ordersTable.store_id, storeId));
  }

  const rows = await db
    .select({
      bucket,
      customer_created_at: customersTable.created_at,
      orders: sql<number>`COUNT(*)::int`,
    })
    .from(ordersTable)
    .innerJoin(customersTable, eq(ordersTable.customer_id, customersTable.id))
    .where(and(...conditions))
    .groupBy(bucket, customersTable.id, customersTable.created_at);

  return rows.map((row) => ({
    bucket: row.bucket,
    customer_created_at: row.customer_created_at,
    orders: Number(row.orders),
  }));
}

export async function listTopCustomers({
  range,
  storeId,
  limit = 10,
}: {
  range: DateRange;
  storeId?: number;
  limit?: number;
}) {
  const conditions = [
    gte(ordersTable.paid_at, range.start),
    lt(ordersTable.paid_at, range.end),
    isNotNull(ordersTable.paid_at),
    isNotNull(ordersTable.customer_id),
  ];
  if (storeId !== undefined) {
    conditions.push(eq(ordersTable.store_id, storeId));
  }

  const rows = await db
    .select({
      customer_id: customersTable.id,
      customer_name: customersTable.name,
      customer_phone: customersTable.phone_number,
      orders: sql<number>`COUNT(*)::int`,
      revenue: sql<string>`COALESCE(SUM(${ordersTable.paid_amount}), 0)`,
    })
    .from(ordersTable)
    .innerJoin(customersTable, eq(ordersTable.customer_id, customersTable.id))
    .where(and(...conditions))
    .groupBy(
      customersTable.id,
      customersTable.name,
      customersTable.phone_number
    )
    .orderBy(desc(sql`SUM(${ordersTable.paid_amount})`))
    .limit(limit);

  return rows.map((row) => ({
    customer_id: row.customer_id,
    customer_name: row.customer_name,
    customer_phone: row.customer_phone,
    orders: Number(row.orders),
    revenue: Number(row.revenue),
  }));
}

export async function findCumulativeCustomersBefore({
  before,
  storeId,
}: {
  before: Date;
  storeId?: number;
}) {
  const conditions = [lt(customersTable.created_at, before)];
  if (storeId !== undefined) {
    conditions.push(eq(customersTable.origin_store_id, storeId));
  }

  const [row] = await db
    .select({ total: count() })
    .from(customersTable)
    .where(and(...conditions));

  return Number(row?.total ?? 0);
}

export async function findRepeatCustomerStats({
  range,
  storeId,
}: {
  range: DateRange;
  storeId?: number;
}) {
  const conditions = [
    gte(ordersTable.created_at, range.start),
    lt(ordersTable.created_at, range.end),
    isNotNull(ordersTable.customer_id),
  ];
  if (storeId !== undefined) {
    conditions.push(eq(ordersTable.store_id, storeId));
  }

  const [row] = await db
    .select({
      total_customers: sql<number>`COUNT(*)::int`,
      repeat_customers: sql<number>`COUNT(*) FILTER (WHERE order_count > 1)::int`,
    })
    .from(
      db
        .select({
          customer_id: ordersTable.customer_id,
          order_count: sql<number>`COUNT(*)`.as("order_count"),
        })
        .from(ordersTable)
        .where(and(...conditions))
        .groupBy(ordersTable.customer_id)
        .as("customer_orders")
    );

  return {
    total_customers: Number(row?.total_customers ?? 0),
    repeat_customers: Number(row?.repeat_customers ?? 0),
  };
}

// ───────────────────────── Refund trend (R5) ─────────────────────────

export async function listRefundAmountSeries({
  range,
  storeId,
  granularity,
}: BaseRangeArgs) {
  const bucket = jakartaBucketExpr(orderRefundsTable.created_at, granularity);
  const conditions = [
    gte(orderRefundsTable.created_at, range.start),
    lt(orderRefundsTable.created_at, range.end),
  ];
  if (storeId !== undefined) {
    conditions.push(eq(ordersTable.store_id, storeId));
  }

  const rows = await db
    .select({
      bucket,
      amount: sql<string>`COALESCE(SUM(${orderRefundsTable.total_amount}), 0)`,
      refunds: sql<number>`COUNT(DISTINCT ${orderRefundsTable.id})::int`,
    })
    .from(orderRefundsTable)
    .innerJoin(ordersTable, eq(orderRefundsTable.order_id, ordersTable.id))
    .where(and(...conditions))
    .groupBy(bucket);

  return rows.map((row) => ({
    bucket: row.bucket,
    amount: Number(row.amount),
    refunds: Number(row.refunds),
  }));
}

export async function listRefundReasonSeries({
  range,
  storeId,
  granularity,
}: BaseRangeArgs) {
  const bucket = jakartaBucketExpr(orderRefundsTable.created_at, granularity);
  const conditions = [
    gte(orderRefundsTable.created_at, range.start),
    lt(orderRefundsTable.created_at, range.end),
  ];
  if (storeId !== undefined) {
    conditions.push(eq(ordersTable.store_id, storeId));
  }

  const rows = await db
    .select({
      bucket,
      reason: orderRefundItemsTable.reason,
      amount: sql<string>`COALESCE(SUM(${orderRefundItemsTable.amount}), 0)`,
      items: sql<number>`COUNT(*)::int`,
    })
    .from(orderRefundItemsTable)
    .innerJoin(
      orderRefundsTable,
      eq(orderRefundItemsTable.order_refund_id, orderRefundsTable.id)
    )
    .innerJoin(ordersTable, eq(orderRefundsTable.order_id, ordersTable.id))
    .where(and(...conditions))
    .groupBy(bucket, orderRefundItemsTable.reason);

  return rows.map((row) => ({
    bucket: row.bucket,
    reason: row.reason,
    amount: Number(row.amount),
    items: Number(row.items),
  }));
}

// ───────────────────────── Worker productivity (R7) ─────────────────────────

async function fetchAttribution(
  processingLog: ReturnType<
    typeof alias<typeof orderServiceStatusLogsTable, string>
  >,
  orderServiceIds: number[],
  storeId?: number
) {
  if (orderServiceIds.length === 0) {
    return [];
  }
  const conditions = [
    eq(processingLog.to_status, "processing"),
    eq(processingLog.from_status, "queued"),
    inArray(processingLog.order_service_id, orderServiceIds),
  ];
  if (storeId !== undefined) {
    conditions.push(eq(ordersTable.store_id, storeId));
  }
  return await db
    .selectDistinctOn([processingLog.order_service_id], {
      worker_id: processingLog.changed_by,
      order_service_id: processingLog.order_service_id,
    })
    .from(processingLog)
    .innerJoin(
      ordersServicesTable,
      eq(processingLog.order_service_id, ordersServicesTable.id)
    )
    .innerJoin(ordersTable, eq(ordersServicesTable.order_id, ordersTable.id))
    .where(and(...conditions))
    .orderBy(processingLog.order_service_id, desc(processingLog.created_at));
}

function fetchCompletions(range: DateRange, storeId?: number) {
  const conditions = [
    eq(orderServiceStatusLogsTable.to_status, "ready_for_pickup"),
    gte(orderServiceStatusLogsTable.created_at, range.start),
    lt(orderServiceStatusLogsTable.created_at, range.end),
  ];
  if (storeId !== undefined) {
    conditions.push(eq(ordersTable.store_id, storeId));
  }
  // Rework cycles (quality_check → processing → ready_for_pickup) can emit
  // multiple ready_for_pickup logs per item; DISTINCT keeps items_completed
  // aligned with physically distinct finished items.
  return db
    .selectDistinctOn([orderServiceStatusLogsTable.order_service_id], {
      order_service_id: orderServiceStatusLogsTable.order_service_id,
    })
    .from(orderServiceStatusLogsTable)
    .innerJoin(
      ordersServicesTable,
      eq(orderServiceStatusLogsTable.order_service_id, ordersServicesTable.id)
    )
    .innerJoin(ordersTable, eq(ordersServicesTable.order_id, ordersTable.id))
    .where(and(...conditions))
    .orderBy(
      orderServiceStatusLogsTable.order_service_id,
      desc(orderServiceStatusLogsTable.created_at)
    );
}

function fetchRefundsPerItem(range: DateRange, storeId?: number) {
  const conditions = [
    gte(orderRefundsTable.created_at, range.start),
    lt(orderRefundsTable.created_at, range.end),
  ];
  if (storeId !== undefined) {
    conditions.push(eq(ordersTable.store_id, storeId));
  }
  return db
    .select({
      order_service_id: orderRefundItemsTable.order_service_id,
      refunds: sql<number>`COUNT(DISTINCT ${orderRefundItemsTable.id})::int`,
    })
    .from(orderRefundItemsTable)
    .innerJoin(
      orderRefundsTable,
      eq(orderRefundItemsTable.order_refund_id, orderRefundsTable.id)
    )
    .innerJoin(ordersTable, eq(orderRefundsTable.order_id, ordersTable.id))
    .where(and(...conditions))
    .groupBy(orderRefundItemsTable.order_service_id);
}

function fetchShiftMinutes(range: DateRange, storeId?: number) {
  const conditions = [
    isNotNull(shiftsTable.clock_out_at),
    gte(shiftsTable.clock_in_at, range.start),
    lt(shiftsTable.clock_in_at, range.end),
  ];
  if (storeId !== undefined) {
    conditions.push(eq(shiftsTable.store_id, storeId));
  }
  return db
    .select({
      user_id: shiftsTable.user_id,
      minutes: sql<number>`COALESCE(SUM(EXTRACT(EPOCH FROM (${shiftsTable.clock_out_at} - ${shiftsTable.clock_in_at})) / 60), 0)::int`,
    })
    .from(shiftsTable)
    .where(and(...conditions))
    .groupBy(shiftsTable.user_id);
}

function fetchReworkCounts(
  reworkLog: ReturnType<
    typeof alias<typeof orderServiceStatusLogsTable, string>
  >,
  range: DateRange,
  storeId?: number
) {
  const conditions = [
    eq(reworkLog.from_status, "quality_check"),
    eq(reworkLog.to_status, "processing"),
    gte(reworkLog.created_at, range.start),
    lt(reworkLog.created_at, range.end),
  ];
  if (storeId !== undefined) {
    conditions.push(eq(ordersTable.store_id, storeId));
  }
  return db
    .select({
      order_service_id: reworkLog.order_service_id,
      rework_count: sql<number>`COUNT(*)::int`,
    })
    .from(reworkLog)
    .innerJoin(
      ordersServicesTable,
      eq(reworkLog.order_service_id, ordersServicesTable.id)
    )
    .innerJoin(ordersTable, eq(ordersServicesTable.order_id, ordersTable.id))
    .where(and(...conditions))
    .groupBy(reworkLog.order_service_id);
}

function fetchWorkerUsers() {
  return db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      role: usersTable.role,
    })
    .from(usersTable)
    .where(eq(usersTable.role, "worker"));
}

function aggregatePerWorker(
  attributionRows: Array<{ worker_id: number; order_service_id: number }>,
  completions: Array<{ order_service_id: number }>,
  refunds: Array<{ order_service_id: number; refunds: number }>,
  reworks: Array<{ order_service_id: number; rework_count: number }>
) {
  const attribution = new Map<number, number>();
  for (const row of attributionRows) {
    if (!attribution.has(row.order_service_id)) {
      attribution.set(row.order_service_id, row.worker_id);
    }
  }
  const completedMap = new Map<number, number>();
  for (const row of completions) {
    const worker = attribution.get(row.order_service_id);
    if (worker !== undefined) {
      completedMap.set(worker, (completedMap.get(worker) ?? 0) + 1);
    }
  }
  const refundMap = new Map<number, number>();
  for (const row of refunds) {
    const worker = attribution.get(row.order_service_id);
    if (worker !== undefined) {
      refundMap.set(worker, (refundMap.get(worker) ?? 0) + Number(row.refunds));
    }
  }
  const reworkTotals = new Map<number, { items: number; events: number }>();
  for (const row of reworks) {
    const worker = attribution.get(row.order_service_id);
    if (worker === undefined) {
      continue;
    }
    const entry = reworkTotals.get(worker) ?? { items: 0, events: 0 };
    entry.items += 1;
    entry.events += Number(row.rework_count);
    reworkTotals.set(worker, entry);
  }
  return { completedMap, refundMap, reworkTotals };
}

export async function listWorkerProductivityRows({
  range,
  storeId,
}: {
  range: DateRange;
  storeId?: number;
}) {
  const processingLog = alias(
    orderServiceStatusLogsTable,
    "processing_attribution"
  );
  const reworkLog = alias(orderServiceStatusLogsTable, "rework_log");

  const [completions, refunds, shiftRows, reworks, workers] = await Promise.all(
    [
      fetchCompletions(range, storeId),
      fetchRefundsPerItem(range, storeId),
      fetchShiftMinutes(range, storeId),
      fetchReworkCounts(reworkLog, range, storeId),
      fetchWorkerUsers(),
    ]
  );

  const terminalItemIds = new Set<number>();
  for (const row of completions) {
    terminalItemIds.add(row.order_service_id);
  }
  for (const row of refunds) {
    terminalItemIds.add(row.order_service_id);
  }
  for (const row of reworks) {
    terminalItemIds.add(row.order_service_id);
  }

  const attributionRows = await fetchAttribution(
    processingLog,
    [...terminalItemIds],
    storeId
  );

  const { completedMap, refundMap, reworkTotals } = aggregatePerWorker(
    attributionRows,
    completions,
    refunds,
    reworks
  );

  const minutesMap = new Map<number, number>();
  for (const row of shiftRows) {
    minutesMap.set(row.user_id, Number(row.minutes));
  }

  return workers
    .map((worker) => {
      const completed = completedMap.get(worker.id) ?? 0;
      const refundItems = refundMap.get(worker.id) ?? 0;
      const minutes = minutesMap.get(worker.id) ?? 0;
      const hours = minutes / 60;
      const itemsPerHour = hours > 0 ? completed / hours : 0;
      const rework = reworkTotals.get(worker.id) ?? { items: 0, events: 0 };
      const reworkRate = completed > 0 ? rework.items / completed : 0;
      return {
        user_id: worker.id,
        user_name: worker.name,
        items_completed: completed,
        refund_items: refundItems,
        rework_items: rework.items,
        rework_events: rework.events,
        rework_rate: Number(reworkRate.toFixed(4)),
        shift_minutes: minutes,
        items_per_hour: Number(itemsPerHour.toFixed(2)),
      };
    })
    .sort((a, b) => b.items_completed - a.items_completed);
}

// ───────────────────────── Campaign effectiveness (R8) ─────────────────────────

export async function listCampaignEffectivenessRows({
  range,
  storeId,
}: {
  range: DateRange;
  storeId?: number;
}) {
  const conditions = [
    gte(ordersTable.paid_at, range.start),
    lt(ordersTable.paid_at, range.end),
    isNotNull(ordersTable.paid_at),
  ];
  if (storeId !== undefined) {
    conditions.push(eq(ordersTable.store_id, storeId));
  }

  const discountRows = await db
    .select({
      campaign_id: campaignsTable.id,
      campaign_name: campaignsTable.name,
      campaign_code: campaignsTable.code,
      discount_cost: sql<string>`COALESCE(SUM(${orderCampaignsTable.applied_amount}), 0)`,
    })
    .from(orderCampaignsTable)
    .innerJoin(ordersTable, eq(orderCampaignsTable.order_id, ordersTable.id))
    .innerJoin(
      campaignsTable,
      eq(orderCampaignsTable.campaign_id, campaignsTable.id)
    )
    .where(and(...conditions))
    .groupBy(campaignsTable.id, campaignsTable.name, campaignsTable.code);

  const orderRows = await db
    .selectDistinct({
      campaign_id: orderCampaignsTable.campaign_id,
      order_id: ordersTable.id,
      paid_amount: ordersTable.paid_amount,
      total: ordersTable.total,
    })
    .from(orderCampaignsTable)
    .innerJoin(ordersTable, eq(orderCampaignsTable.order_id, ordersTable.id))
    .where(and(...conditions));

  const orderMetrics = new Map<
    number,
    { orders: number; revenue: number; totalSum: number }
  >();
  for (const row of orderRows) {
    const entry = orderMetrics.get(row.campaign_id) ?? {
      orders: 0,
      revenue: 0,
      totalSum: 0,
    };
    entry.orders += 1;
    entry.revenue += Number(row.paid_amount);
    entry.totalSum += Number(row.total ?? 0);
    orderMetrics.set(row.campaign_id, entry);
  }

  return discountRows
    .map((row) => {
      const metrics = orderMetrics.get(row.campaign_id) ?? {
        orders: 0,
        revenue: 0,
        totalSum: 0,
      };
      return {
        campaign_id: row.campaign_id,
        campaign_name: row.campaign_name,
        campaign_code: row.campaign_code,
        orders: metrics.orders,
        revenue: metrics.revenue,
        discount_cost: Number(row.discount_cost),
        avg_order_value:
          metrics.orders > 0 ? metrics.totalSum / metrics.orders : 0,
      };
    })
    .sort((a, b) => b.orders - a.orders);
}
