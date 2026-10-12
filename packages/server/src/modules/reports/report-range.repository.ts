import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  inArray,
  isNotNull,
  isNull,
  lt,
  sql,
} from "drizzle-orm";
import { alias, type SelectedFields } from "drizzle-orm/pg-core";
import { db } from "@/db";
import {
  campaignsTable,
  categoriesTable,
  complaintsTable,
  customersTable,
  itemsTable,
  orderCampaignsTable,
  orderPickupEventsTable,
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

const startLog = alias(orderServiceStatusLogsTable, "start_log");
const passLog = alias(orderServiceStatusLogsTable, "pass_log");
const qcCheckLog = alias(orderServiceStatusLogsTable, "qc_check_log");

// Every Service processed in the stretch, credited to whoever started it.
function listProcessedLines<TDetail extends SelectedFields>(
  { range, storeId }: RangeArgs,
  detail: TDetail
) {
  const processed = listServicesProcessed({ range, storeId }).as("processed");
  return db
    .selectDistinctOn([processed.order_service_id], {
      order_service_id: processed.order_service_id,
      processed_at: processed.processed_at,
      started_by: startLog.changed_by,
      store_id: ordersTable.store_id,
      ...detail,
    })
    .from(processed)
    .innerJoin(
      ordersServicesTable,
      eq(processed.order_service_id, ordersServicesTable.id)
    )
    .innerJoin(ordersTable, eq(ordersServicesTable.order_id, ordersTable.id))
    .leftJoin(
      servicesTable,
      eq(ordersServicesTable.service_id, servicesTable.id)
    )
    .leftJoin(
      startLog,
      and(
        eq(startLog.order_service_id, ordersServicesTable.id),
        eq(startLog.from_status, "queued"),
        eq(startLog.to_status, "processing")
      )
    )
    .orderBy(processed.order_service_id, desc(startLog.created_at));
}

// What the Complaint rate needs from every line, this stretch or the last.
function complaintFlags() {
  return {
    is_rework: sql<boolean>`${isNotNull(ordersServicesTable.complaint_id)}`,
    passed: sql<boolean>`${exists(
      db
        .select({ id: passLog.id })
        .from(passLog)
        .where(
          and(
            eq(passLog.order_service_id, ordersServicesTable.id),
            eq(passLog.from_status, "quality_check"),
            eq(passLog.to_status, "ready_for_pickup")
          )
        )
    )}`,
    has_complaint: sql<boolean>`${exists(
      db
        .select({ id: complaintsTable.id })
        .from(complaintsTable)
        .where(eq(complaintsTable.order_service_id, ordersServicesTable.id))
    )}`,
  };
}

// What the rows need beyond the headline. Once the line has passed QC, a
// Complaint about it belongs to whoever cleaned the round that passed, not to
// whoever started it.
function lineDetail() {
  const firstPass = db
    .select({ cleaner_id: sql`${cleanerOfRound(passLog)}` })
    .from(passLog)
    .where(
      and(
        eq(passLog.order_service_id, ordersServicesTable.id),
        eq(passLog.from_status, "quality_check"),
        eq(passLog.to_status, "ready_for_pickup")
      )
    )
    .orderBy(asc(passLog.created_at), asc(passLog.id))
    .limit(1);

  return {
    service_id: ordersServicesTable.service_id,
    service_name: servicesTable.name,
    passed_cleaner_id: sql<number | null>`${firstPass}`,
    ...complaintFlags(),
  };
}

function listShiftsInRange({ range, storeId }: RangeArgs) {
  return db
    .select({
      user_id: shiftsTable.user_id,
      store_id: shiftsTable.store_id,
      clock_in_at: shiftsTable.clock_in_at,
      clock_out_at: shiftsTable.clock_out_at,
    })
    .from(shiftsTable)
    .where(
      and(
        ...timeWindow(shiftsTable.clock_in_at, range),
        storeScope(shiftsTable.store_id, storeId)
      )
    );
}

const BENCH_STATUSES = [
  "processing",
  "quality_check",
  "qc_reject",
  "ready_for_pickup",
] as const;

// Days a person moved an Item through the bench, at the Order's Store. Workers
// who rarely clock in still show a day worked. Pickups, refunds and cancels are
// the counter's work, so they are left out. The day is cut at Jakarta midnight
// here rather than with jakartaBucketExpr.
function listBenchMoveDays({ range, storeId }: RangeArgs) {
  const day = sql<string>`to_char((${orderServiceStatusLogsTable.created_at} AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD')`;
  return db
    .select({
      user_id: orderServiceStatusLogsTable.changed_by,
      store_id: ordersTable.store_id,
      day,
    })
    .from(orderServiceStatusLogsTable)
    .innerJoin(
      ordersServicesTable,
      eq(orderServiceStatusLogsTable.order_service_id, ordersServicesTable.id)
    )
    .innerJoin(ordersTable, eq(ordersServicesTable.order_id, ordersTable.id))
    .where(
      and(
        ...timeWindow(orderServiceStatusLogsTable.created_at, range),
        inArray(orderServiceStatusLogsTable.to_status, BENCH_STATUSES),
        storeScope(ordersTable.store_id, storeId)
      )
    )
    .groupBy(orderServiceStatusLogsTable.changed_by, ordersTable.store_id, day);
}

// A pair Bayu redid after Adi's round was sent back is Bayu's next check, not
// Adi's: each check goes to the round's cleaner, as the Quality tab names them.
function listQcChecksByCleaner({ range, storeId }: RangeArgs) {
  const checks = db
    .select({
      cleaner_id: sql<number | null>`${cleanerOfRound(qcCheckLog)}`.as(
        "cleaner_id"
      ),
      store_id: ordersTable.store_id,
      is_reject: sql<boolean>`${eq(qcCheckLog.to_status, "qc_reject")}`.as(
        "is_reject"
      ),
    })
    .from(qcCheckLog)
    .innerJoin(
      ordersServicesTable,
      eq(qcCheckLog.order_service_id, ordersServicesTable.id)
    )
    .innerJoin(ordersTable, eq(ordersServicesTable.order_id, ordersTable.id))
    .where(qualityCheckInRange(qcCheckLog, { range, storeId }))
    .as("checks");

  return db
    .select({
      cleaner_id: checks.cleaner_id,
      store_id: checks.store_id,
      checks: sql<number>`COUNT(*)::int`,
      rejects: sql<number>`(COUNT(*) FILTER (WHERE ${checks.is_reject}))::int`,
    })
    .from(checks)
    .groupBy(checks.cleaner_id, checks.store_id);
}

async function listActivity<TDetail extends SelectedFields>(
  args: RangeArgs,
  detail: TDetail
) {
  const [lines, shifts, moveDays, qcChecks] = await Promise.all([
    listProcessedLines(args, detail),
    listShiftsInRange(args),
    listBenchMoveDays(args),
    listQcChecksByCleaner(args),
  ]);
  return { lines, shifts, moveDays, qcChecks };
}

export const listWorkerActivity = (args: RangeArgs) =>
  listActivity(args, lineDetail());

// The previous stretch only feeds the headline comparison, so it skips the
// Service names and cleaner lookups that the rows need.
export const listWorkerSummaryActivity = (args: RangeArgs) =>
  listActivity(args, complaintFlags());

// Every QC check on rounds this person cleaned at one Store, newest first: the
// detail page's QC rejects and each Service's check count come from these.
export async function listQcChecksOfCleaner({
  range,
  storeId,
  userId,
}: RangeArgs & { userId: number }) {
  return await db
    .select({
      checked_at: qcCheckLog.created_at,
      is_reject: sql<boolean>`${eq(qcCheckLog.to_status, "qc_reject")}`,
      note: qcCheckLog.note,
      order_id: ordersTable.id,
      order_service_id: ordersServicesTable.id,
      item_code: itemsTable.item_code,
      service_id: ordersServicesTable.service_id,
      service_name: servicesTable.name,
    })
    .from(qcCheckLog)
    .innerJoin(
      ordersServicesTable,
      eq(qcCheckLog.order_service_id, ordersServicesTable.id)
    )
    .innerJoin(ordersTable, eq(ordersServicesTable.order_id, ordersTable.id))
    .innerJoin(itemsTable, eq(ordersServicesTable.item_id, itemsTable.id))
    .leftJoin(
      servicesTable,
      eq(ordersServicesTable.service_id, servicesTable.id)
    )
    .where(
      and(
        qualityCheckInRange(qcCheckLog, { range, storeId }),
        eq(sql`(${cleanerOfRound(qcCheckLog)})`, userId)
      )
    )
    .orderBy(desc(qcCheckLog.created_at), desc(qcCheckLog.id));
}

export function listComplaintItems(orderServiceIds: number[]) {
  return db
    .select({
      complaint_id: complaintsTable.id,
      created_at: complaintsTable.created_at,
      reason: complaintsTable.reason,
      order_id: ordersServicesTable.order_id,
      order_service_id: ordersServicesTable.id,
      item_code: itemsTable.item_code,
    })
    .from(complaintsTable)
    .innerJoin(
      ordersServicesTable,
      eq(complaintsTable.order_service_id, ordersServicesTable.id)
    )
    .innerJoin(itemsTable, eq(ordersServicesTable.item_id, itemsTable.id))
    .where(inArray(complaintsTable.order_service_id, orderServiceIds));
}

export async function listWorkerLiveActivity({ range, storeId }: RangeArgs) {
  const [inHand, lastMoves, openShifts] = await Promise.all([
    db
      .select({
        user_id: sql<number>`${ordersServicesTable.handler_id}`,
        store_id: ordersTable.store_id,
        in_hand: sql<number>`COUNT(*)::int`,
      })
      .from(ordersServicesTable)
      .innerJoin(ordersTable, eq(ordersServicesTable.order_id, ordersTable.id))
      .where(
        and(
          eq(ordersServicesTable.status, "processing"),
          isNotNull(ordersServicesTable.handler_id),
          storeScope(ordersTable.store_id, storeId)
        )
      )
      .groupBy(ordersServicesTable.handler_id, ordersTable.store_id),
    db
      .select({
        user_id: orderServiceStatusLogsTable.changed_by,
        store_id: ordersTable.store_id,
        last_move_at:
          sql`MAX(${orderServiceStatusLogsTable.created_at})`.mapWith(
            orderServiceStatusLogsTable.created_at
          ),
      })
      .from(orderServiceStatusLogsTable)
      .innerJoin(
        ordersServicesTable,
        eq(orderServiceStatusLogsTable.order_service_id, ordersServicesTable.id)
      )
      .innerJoin(ordersTable, eq(ordersServicesTable.order_id, ordersTable.id))
      .where(
        and(
          ...timeWindow(orderServiceStatusLogsTable.created_at, range),
          // A cashier's pickup is not bench work, so it is no "last move".
          inArray(orderServiceStatusLogsTable.to_status, BENCH_STATUSES),
          storeScope(ordersTable.store_id, storeId)
        )
      )
      .groupBy(orderServiceStatusLogsTable.changed_by, ordersTable.store_id),
    // Still on the floor, even from a clock-in before today.
    db
      .select({
        user_id: shiftsTable.user_id,
        store_id: shiftsTable.store_id,
        clock_in_at: shiftsTable.clock_in_at,
        clock_out_at: shiftsTable.clock_out_at,
      })
      .from(shiftsTable)
      .where(
        and(
          isNull(shiftsTable.clock_out_at),
          storeScope(shiftsTable.store_id, storeId)
        )
      ),
  ]);
  return { inHand, lastMoves, openShifts };
}

// Both tables are a shop's worth of rows, so the report reads them whole
// alongside its other queries rather than waiting to learn which ids it needs.
export function listUserNames() {
  return db
    .select({ id: usersTable.id, name: usersTable.name, role: usersTable.role })
    .from(usersTable);
}

export function listStoreNames() {
  return db
    .select({ id: storesTable.id, name: storesTable.name })
    .from(storesTable);
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
