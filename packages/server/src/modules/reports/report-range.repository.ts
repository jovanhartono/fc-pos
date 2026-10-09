import {
  and,
  asc,
  count,
  desc,
  eq,
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
  collected,
  discount,
  grossSales,
  paidOrderWindow,
  type RangeArgs,
  refunded,
  storeScope,
  sumMoney,
  timeWindow,
} from "@/modules/reports/money-basis";
import {
  cleanerOfRound,
  qualityCheckInRange,
} from "@/modules/reports/quality.repository";
import {
  type DateRange,
  type Granularity,
  jakartaBucketExpr,
} from "@/modules/reports/report-range.util";
import { listServicesProcessed } from "@/modules/reports/services-processed";

interface SeriesRangeArgs extends RangeArgs {
  granularity: Granularity;
}

async function sumByBucket(
  lineTable: typeof ordersServicesTable | typeof ordersProductsTable,
  amount: "subtotal" | "cogs_snapshot",
  { range, storeId, granularity }: SeriesRangeArgs
) {
  const bucket = jakartaBucketExpr(ordersTable.paid_at, granularity);
  return await db
    .select({
      bucket,
      total: sumMoney(lineTable[amount]),
    })
    .from(lineTable)
    .innerJoin(ordersTable, eq(lineTable.order_id, ordersTable.id))
    .where(and(...paidOrderWindow({ range, storeId })))
    .groupBy(bucket);
}

// ───────────────────────── Gross sales trend (R1) ─────────────────────────

export async function listServicesGrossSalesSeries(args: SeriesRangeArgs) {
  const rows = await sumByBucket(ordersServicesTable, "subtotal", args);
  return rows.map((row) => ({
    bucket: row.bucket,
    gross_sales: Number(row.total),
  }));
}

export async function listProductsGrossSalesSeries(args: SeriesRangeArgs) {
  const rows = await sumByBucket(ordersProductsTable, "subtotal", args);
  return rows.map((row) => ({
    bucket: row.bucket,
    gross_sales: Number(row.total),
  }));
}

// ───────────────────────── COGS (Financial) ─────────────────────────

export async function listServicesCogsSeries(args: SeriesRangeArgs) {
  const rows = await sumByBucket(ordersServicesTable, "cogs_snapshot", args);
  return rows.map((row) => ({ bucket: row.bucket, cogs: Number(row.total) }));
}

export async function listProductsCogsSeries(args: SeriesRangeArgs) {
  const rows = await sumByBucket(ordersProductsTable, "cogs_snapshot", args);
  return rows.map((row) => ({ bucket: row.bucket, cogs: Number(row.total) }));
}

// ───────────────────────── Discount (Financial) ─────────────────────────

export async function listOrderDiscountSeries({
  range,
  storeId,
  granularity,
}: SeriesRangeArgs) {
  const bucket = jakartaBucketExpr(ordersTable.paid_at, granularity);
  const rows = await db
    .select({
      bucket,
      discount: discount(),
    })
    .from(ordersTable)
    .where(and(...paidOrderWindow({ range, storeId })))
    .groupBy(bucket);

  return rows.map((row) => ({
    bucket: row.bucket,
    discount: Number(row.discount),
  }));
}

// ───────────────────────── Collected (Financial) ─────────────────────────

export async function listCollectedSeries({
  range,
  storeId,
  granularity,
}: SeriesRangeArgs) {
  const bucket = jakartaBucketExpr(ordersTable.paid_at, granularity);
  const rows = await db
    .select({
      bucket,
      collected: collected(),
    })
    .from(ordersTable)
    .where(and(...paidOrderWindow({ range, storeId })))
    .groupBy(bucket);

  return rows.map((row) => ({
    bucket: row.bucket,
    collected: Number(row.collected),
  }));
}

// ───────────────────────── Store takings (store donut) ─────────────────────────

export async function listStoreCollectedRows({ range, storeId }: RangeArgs) {
  const rows = await db
    .select({
      store_id: ordersTable.store_id,
      store_name: storesTable.name,
      store_code: storesTable.code,
      collected: collected(),
      orders: sql<number>`COUNT(*)::int`,
    })
    .from(ordersTable)
    .innerJoin(storesTable, eq(ordersTable.store_id, storesTable.id))
    .where(and(...paidOrderWindow({ range, storeId })))
    .groupBy(ordersTable.store_id, storesTable.name, storesTable.code)
    .orderBy(asc(storesTable.code));

  return rows.map((row) => ({
    store_id: row.store_id,
    store_name: row.store_name,
    store_code: row.store_code,
    collected: Number(row.collected),
    orders: Number(row.orders),
  }));
}

export async function listStoreRefundRows({ range, storeId }: RangeArgs) {
  const rows = await db
    .select({
      store_id: ordersTable.store_id,
      store_name: storesTable.name,
      store_code: storesTable.code,
      refunds: refunded(),
    })
    .from(orderRefundsTable)
    .innerJoin(ordersTable, eq(orderRefundsTable.order_id, ordersTable.id))
    .innerJoin(storesTable, eq(ordersTable.store_id, storesTable.id))
    .where(
      and(
        ...timeWindow(orderRefundsTable.created_at, range),
        storeScope(ordersTable.store_id, storeId)
      )
    )
    .groupBy(ordersTable.store_id, storesTable.name, storesTable.code);

  return rows.map((row) => ({
    store_id: row.store_id,
    store_name: row.store_name,
    store_code: row.store_code,
    refunds: Number(row.refunds),
  }));
}

// ───────────────────────── Category trend (R6) ─────────────────────────

export async function listCategoryGrossSalesSeries({
  range,
  storeId,
  granularity,
}: SeriesRangeArgs) {
  const bucket = jakartaBucketExpr(ordersTable.paid_at, granularity);
  const rows = await db
    .select({
      bucket,
      category_id: categoriesTable.id,
      category_name: categoriesTable.name,
      gross_sales: grossSales(ordersServicesTable),
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
    .groupBy(bucket, categoriesTable.id, categoriesTable.name);

  return rows.map((row) => ({
    bucket: row.bucket,
    category_id: row.category_id,
    category_name: row.category_name,
    gross_sales: Number(row.gross_sales),
  }));
}

// ───────────────────────── Store × Category gross sales ─────────────────────────

export async function listStoreCategoryGrossSalesRows({
  range,
  storeId,
}: RangeArgs) {
  const rows = await db
    .select({
      store_id: ordersTable.store_id,
      store_name: storesTable.name,
      store_code: storesTable.code,
      category_id: categoriesTable.id,
      category_name: categoriesTable.name,
      gross_sales: grossSales(ordersServicesTable),
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
    .where(and(...paidOrderWindow({ range, storeId })))
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
    gross_sales: Number(row.gross_sales),
  }));
}

// ───────────────────────── Orders flow (R2) ─────────────────────────

export async function listOrdersInSeries({
  range,
  storeId,
  granularity,
}: SeriesRangeArgs) {
  const bucket = jakartaBucketExpr(ordersTable.created_at, granularity);
  const conditions = [
    ...timeWindow(ordersTable.created_at, range),
    storeScope(ordersTable.store_id, storeId),
  ];

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
}: SeriesRangeArgs) {
  const bucket = jakartaBucketExpr(
    orderPickupEventsTable.picked_up_at,
    granularity
  );
  const conditions = [
    ...timeWindow(orderPickupEventsTable.picked_up_at, range),
    storeScope(ordersTable.store_id, storeId),
  ];

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

export async function findDistinctHandlerCount({ range, storeId }: RangeArgs) {
  const conditions = [
    ...timeWindow(orderServiceStatusLogsTable.created_at, range),
    eq(orderServiceStatusLogsTable.to_status, "processing"),
    eq(orderServiceStatusLogsTable.from_status, "queued"),
    storeScope(ordersTable.store_id, storeId),
  ];

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
}: SeriesRangeArgs) {
  const bucket = jakartaBucketExpr(ordersTable.paid_at, granularity);
  const rows = await db
    .select({
      bucket,
      payment_method_id: ordersTable.payment_method_id,
      payment_method_name: paymentMethodsTable.name,
      collected: collected(),
      orders: sql<number>`COUNT(*)::int`,
    })
    .from(ordersTable)
    .leftJoin(
      paymentMethodsTable,
      eq(ordersTable.payment_method_id, paymentMethodsTable.id)
    )
    .where(and(...paidOrderWindow({ range, storeId })))
    .groupBy(bucket, ordersTable.payment_method_id, paymentMethodsTable.name);

  return rows.map((row) => ({
    bucket: row.bucket,
    payment_method_id: row.payment_method_id ?? 0,
    payment_method_name: row.payment_method_name ?? "Unknown",
    collected: Number(row.collected),
    orders: Number(row.orders),
  }));
}

// ───────────────────────── Customer acquisition (R4) ─────────────────────────

export async function listNewCustomersSeries({
  range,
  storeId,
  granularity,
}: SeriesRangeArgs) {
  const bucket = jakartaBucketExpr(customersTable.created_at, granularity);
  const conditions = [
    ...timeWindow(customersTable.created_at, range),
    storeScope(customersTable.origin_store_id, storeId),
  ];

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
}: SeriesRangeArgs) {
  const bucket = jakartaBucketExpr(ordersTable.created_at, granularity);
  const conditions = [
    ...timeWindow(ordersTable.created_at, range),
    isNotNull(ordersTable.customer_id),
    storeScope(ordersTable.store_id, storeId),
  ];

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
  // Spelled out rather than reusing paidOrderWindow: that helper puts the store
  // filter before "has a customer", and reordering these renumbers the binds
  // against the LIMIT below.
  const conditions = [
    ...timeWindow(ordersTable.paid_at, range),
    isNotNull(ordersTable.paid_at),
    isNotNull(ordersTable.customer_id),
    storeScope(ordersTable.store_id, storeId),
  ];

  const rows = await db
    .select({
      customer_id: customersTable.id,
      customer_name: customersTable.name,
      customer_phone: customersTable.phone_number,
      orders: sql<number>`COUNT(*)::int`,
      collected: collected(),
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
    collected: Number(row.collected),
  }));
}

export async function findCumulativeCustomersBefore({
  before,
  storeId,
}: {
  before: Date;
  storeId?: number;
}) {
  const conditions = [
    lt(customersTable.created_at, before),
    storeScope(customersTable.origin_store_id, storeId),
  ];

  const [row] = await db
    .select({ total: count() })
    .from(customersTable)
    .where(and(...conditions));

  return Number(row?.total ?? 0);
}

export async function findRepeatCustomerStats({ range, storeId }: RangeArgs) {
  const conditions = [
    ...timeWindow(ordersTable.created_at, range),
    isNotNull(ordersTable.customer_id),
    storeScope(ordersTable.store_id, storeId),
  ];

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

// ───────────────────────── Refunds (Financial) ─────────────────────────

export async function listRefundAmountSeries({
  range,
  storeId,
  granularity,
}: SeriesRangeArgs) {
  const bucket = jakartaBucketExpr(orderRefundsTable.created_at, granularity);
  const conditions = [
    ...timeWindow(orderRefundsTable.created_at, range),
    storeScope(ordersTable.store_id, storeId),
  ];

  const rows = await db
    .select({
      bucket,
      amount: refunded(),
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
    storeScope(ordersTable.store_id, storeId),
  ];
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

function fetchRefundsPerItem(range: DateRange, storeId?: number) {
  const conditions = [
    ...timeWindow(orderRefundsTable.created_at, range),
    // product refund lines have no handler; worker attribution is service-only
    isNotNull(orderRefundItemsTable.order_service_id),
    storeScope(ordersTable.store_id, storeId),
  ];
  return db
    .select({
      order_service_id: sql<number>`${orderRefundItemsTable.order_service_id}`,
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
    ...timeWindow(shiftsTable.clock_in_at, range),
    storeScope(shiftsTable.store_id, storeId),
  ];
  return db
    .select({
      user_id: shiftsTable.user_id,
      minutes: sql<number>`COALESCE(SUM(EXTRACT(EPOCH FROM (${shiftsTable.clock_out_at} - ${shiftsTable.clock_in_at})) / 60), 0)::int`,
    })
    .from(shiftsTable)
    .where(and(...conditions))
    .groupBy(shiftsTable.user_id);
}

// A pair Bayu redid after Adi's round was sent back is Bayu's next check, not
// Adi's: each check goes to the round's cleaner, as the Quality tab names them.
function fetchQcCheckCleaners(
  qcCheckLog: ReturnType<
    typeof alias<typeof orderServiceStatusLogsTable, string>
  >,
  range: DateRange,
  storeId?: number
) {
  return db
    .select({
      order_service_id: qcCheckLog.order_service_id,
      cleaner_id: sql<number | null>`${cleanerOfRound(qcCheckLog)}`,
      is_reject: sql<boolean>`${eq(qcCheckLog.to_status, "qc_reject")}`,
    })
    .from(qcCheckLog)
    .innerJoin(
      ordersServicesTable,
      eq(qcCheckLog.order_service_id, ordersServicesTable.id)
    )
    .innerJoin(ordersTable, eq(ordersServicesTable.order_id, ordersTable.id))
    .where(qualityCheckInRange(qcCheckLog, { range, storeId }));
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
  processed: Array<{ order_service_id: number }>,
  refunds: Array<{ order_service_id: number; refunds: number }>,
  qcChecks: Array<{
    order_service_id: number;
    cleaner_id: number | null;
    is_reject: boolean;
  }>
) {
  const attribution = new Map<number, number>();
  for (const row of attributionRows) {
    if (!attribution.has(row.order_service_id)) {
      attribution.set(row.order_service_id, row.worker_id);
    }
  }
  const processedMap = new Map<number, number>();
  for (const row of processed) {
    const worker = attribution.get(row.order_service_id);
    if (worker !== undefined) {
      processedMap.set(worker, (processedMap.get(worker) ?? 0) + 1);
    }
  }
  const refundMap = new Map<number, number>();
  for (const row of refunds) {
    const worker = attribution.get(row.order_service_id);
    if (worker !== undefined) {
      refundMap.set(worker, (refundMap.get(worker) ?? 0) + Number(row.refunds));
    }
  }
  const qcTotals = new Map<
    number,
    { checks: number; events: number; lines: Set<number> }
  >();
  for (const row of qcChecks) {
    if (row.cleaner_id === null) {
      continue;
    }
    const entry = qcTotals.get(row.cleaner_id) ?? {
      checks: 0,
      events: 0,
      lines: new Set<number>(),
    };
    entry.checks += 1;
    if (row.is_reject) {
      entry.events += 1;
      entry.lines.add(row.order_service_id);
    }
    qcTotals.set(row.cleaner_id, entry);
  }
  return { processedMap, refundMap, qcTotals };
}

export async function listWorkerProductivityRows({
  range,
  storeId,
}: RangeArgs) {
  const processingLog = alias(
    orderServiceStatusLogsTable,
    "processing_attribution"
  );
  const qcCheckLog = alias(orderServiceStatusLogsTable, "qc_check_log");

  const [processed, refunds, shiftRows, qcChecks, workers] = await Promise.all([
    listServicesProcessed({ range, storeId }),
    fetchRefundsPerItem(range, storeId),
    fetchShiftMinutes(range, storeId),
    fetchQcCheckCleaners(qcCheckLog, range, storeId),
    fetchWorkerUsers(),
  ]);

  const terminalItemIds = new Set<number>();
  for (const row of processed) {
    terminalItemIds.add(row.order_service_id);
  }
  for (const row of refunds) {
    terminalItemIds.add(row.order_service_id);
  }

  const attributionRows = await fetchAttribution(
    processingLog,
    [...terminalItemIds],
    storeId
  );

  const { processedMap, refundMap, qcTotals } = aggregatePerWorker(
    attributionRows,
    processed,
    refunds,
    qcChecks
  );

  const minutesMap = new Map<number, number>();
  for (const row of shiftRows) {
    minutesMap.set(row.user_id, Number(row.minutes));
  }

  const rows = workers
    .map((worker) => {
      const servicesProcessed = processedMap.get(worker.id) ?? 0;
      const refundItems = refundMap.get(worker.id) ?? 0;
      const minutes = minutesMap.get(worker.id) ?? 0;
      const hours = minutes / 60;
      const servicesPerHour = hours > 0 ? servicesProcessed / hours : 0;
      const qc = qcTotals.get(worker.id);
      const qcChecked = qc?.checks ?? 0;
      const qcRejectEvents = qc?.events ?? 0;
      const qcRejectRate = qcChecked > 0 ? qcRejectEvents / qcChecked : 0;
      return {
        user_id: worker.id,
        user_name: worker.name,
        services_processed: servicesProcessed,
        refund_items: refundItems,
        qc_checks: qcChecked,
        qc_reject_items: qc?.lines.size ?? 0,
        qc_reject_events: qcRejectEvents,
        qc_reject_rate: Number(qcRejectRate.toFixed(4)),
        shift_minutes: minutes,
        services_per_hour: Number(servicesPerHour.toFixed(2)),
      };
    })
    .sort((a, b) => b.services_processed - a.services_processed);

  // A pair sent back in two cleaners' rounds is on both their rows but is one
  // service sent back for the shop.
  const qcRejects = qcChecks.filter((row) => row.is_reject);
  const qcRejectItems = new Set(qcRejects.map((row) => row.order_service_id))
    .size;

  return {
    rows,
    qc_checks: qcChecks.length,
    qc_rejects: qcRejects.length,
    qc_reject_items: qcRejectItems,
  };
}

// ───────────────────────── Campaign effectiveness (R8) ─────────────────────────

export async function listCampaignEffectivenessRows({
  range,
  storeId,
}: RangeArgs) {
  // What a promo cost and what it brought in have to be counted over the same
  // orders, or the discount is charged against a different set of takings.
  const window = paidOrderWindow({ range, storeId });

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
    .where(and(...window))
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
    .where(and(...window));

  const orderMetrics = new Map<
    number,
    { collected: number; orders: number; totalSum: number }
  >();
  for (const row of orderRows) {
    const entry = orderMetrics.get(row.campaign_id) ?? {
      orders: 0,
      collected: 0,
      totalSum: 0,
    };
    entry.orders += 1;
    entry.collected += Number(row.paid_amount);
    entry.totalSum += Number(row.total ?? 0);
    orderMetrics.set(row.campaign_id, entry);
  }

  return discountRows
    .map((row) => {
      const metrics = orderMetrics.get(row.campaign_id) ?? {
        orders: 0,
        collected: 0,
        totalSum: 0,
      };
      return {
        campaign_id: row.campaign_id,
        campaign_name: row.campaign_name,
        campaign_code: row.campaign_code,
        orders: metrics.orders,
        collected: metrics.collected,
        discount_cost: Number(row.discount_cost),
        avg_order_value:
          metrics.orders > 0 ? metrics.totalSum / metrics.orders : 0,
      };
    })
    .sort((a, b) => b.orders - a.orders);
}
