import {
  and,
  asc,
  desc,
  eq,
  exists,
  inArray,
  isNull,
  lte,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import {
  complaintsTable,
  itemsTable,
  orderRefundItemsTable,
  orderRefundsTable,
  orderServiceStatusLogsTable,
  ordersServicesTable,
  ordersTable,
  servicesTable,
  storesTable,
  usersTable,
} from "@/db/schema";
import { REWORKED_ROUND_STATUSES } from "@/modules/complaints/complaint.schema";
import {
  type RangeArgs,
  storeScope,
  timeWindow,
} from "@/modules/reports/money-basis";
import { jakartaBucketExpr } from "@/modules/reports/report-range.util";
import { listServicesProcessed } from "@/modules/reports/services-processed";

const qcLog = alias(orderServiceStatusLogsTable, "qc_log");
const cleanLog = alias(orderServiceStatusLogsTable, "clean_log");
const sentBackLog = alias(orderServiceStatusLogsTable, "sent_back_log");
const reworkLine = alias(ordersServicesTable, "rework_line");
const cleaner = alias(usersTable, "cleaner");
const checker = alias(usersTable, "checker");

type StatusLog = ReturnType<
  typeof alias<typeof orderServiceStatusLogsTable, string>
>;

// A pair sent back and redone by someone else was cleaned, the second time,
// by that someone else: the check judges whoever last started work before it.
export const cleanerOfRound = (check: StatusLog) =>
  db
    .select({ id: cleanLog.changed_by })
    .from(cleanLog)
    .where(
      and(
        eq(cleanLog.order_service_id, check.order_service_id),
        eq(cleanLog.to_status, "processing"),
        lte(cleanLog.created_at, check.created_at)
      )
    )
    .orderBy(desc(cleanLog.created_at), desc(cleanLog.id))
    .limit(1);

// Services processed in the stretch, Rework lines left out: a free re-clean
// for a Complaint is not first-time work and would count the same mistake twice.
export async function listQualityCohort({ range, storeId }: RangeArgs) {
  const processed = listServicesProcessed({ range, storeId }).as("processed");

  return await db
    .select({
      order_service_id: ordersServicesTable.id,
      service_id: ordersServicesTable.service_id,
      service_name: servicesTable.name,
      status: ordersServicesTable.status,
      complaint_id: complaintsTable.id,
      sent_back: sql<boolean>`${exists(
        db
          .select({ id: sentBackLog.id })
          .from(sentBackLog)
          .where(
            and(
              eq(sentBackLog.order_service_id, ordersServicesTable.id),
              eq(sentBackLog.to_status, "qc_reject")
            )
          )
      )}`,
      has_live_rework: sql<boolean>`${exists(
        db
          .select({ id: reworkLine.id })
          .from(reworkLine)
          .where(
            and(
              eq(reworkLine.complaint_id, complaintsTable.id),
              inArray(reworkLine.status, REWORKED_ROUND_STATUSES)
            )
          )
      )}`,
    })
    .from(processed)
    .innerJoin(
      ordersServicesTable,
      eq(processed.order_service_id, ordersServicesTable.id)
    )
    .leftJoin(
      servicesTable,
      eq(ordersServicesTable.service_id, servicesTable.id)
    )
    .leftJoin(
      complaintsTable,
      eq(complaintsTable.order_service_id, ordersServicesTable.id)
    )
    .where(isNull(ordersServicesTable.complaint_id));
}

// One check is an inspector passing or sending back an Item. The caller joins
// the log through to the Order, which carries the Store.
export function qualityCheckInRange(
  log: StatusLog,
  { range, storeId }: RangeArgs
) {
  return and(
    eq(log.from_status, "waiting_qc"),
    inArray(log.to_status, ["ready_for_pickup", "qc_reject"]),
    ...timeWindow(log.created_at, range),
    storeScope(ordersTable.store_id, storeId)
  );
}

export async function listQualityChecksByChecker(args: RangeArgs) {
  const passed = eq(qcLog.to_status, "ready_for_pickup");
  const checks = db
    .select({
      checker_id: qcLog.changed_by,
      day: jakartaBucketExpr(qcLog.created_at, "day").as("day"),
      passed: sql<boolean>`${passed}`.as("passed"),
      cleaner_id: sql<
        number | null
      >`CASE WHEN ${passed} THEN ${cleanerOfRound(qcLog)} END`.as("cleaner_id"),
      has_complaint: sql<boolean>`${exists(
        db
          .select({ id: complaintsTable.id })
          .from(complaintsTable)
          .where(eq(complaintsTable.order_service_id, qcLog.order_service_id))
      )}`.as("has_complaint"),
    })
    .from(qcLog)
    .innerJoin(
      ordersServicesTable,
      eq(qcLog.order_service_id, ordersServicesTable.id)
    )
    .innerJoin(ordersTable, eq(ordersServicesTable.order_id, ordersTable.id))
    .where(qualityCheckInRange(qcLog, args))
    .as("checks");

  return await db
    .select({
      user_id: checks.checker_id,
      user_name: checker.name,
      checks: sql<number>`COUNT(*)::int`,
      days_checked: sql<number>`COUNT(DISTINCT ${checks.day})::int`,
      passes: sql<number>`(COUNT(*) FILTER (WHERE ${checks.passed}))::int`,
      self_checks: sql<number>`(COUNT(*) FILTER (WHERE ${checks.passed} AND ${checks.cleaner_id} = ${checks.checker_id}))::int`,
      complaints_after: sql<number>`(COUNT(*) FILTER (WHERE ${checks.passed} AND ${checks.has_complaint}))::int`,
    })
    .from(checks)
    .innerJoin(checker, eq(checks.checker_id, checker.id))
    .groupBy(checks.checker_id, checker.name)
    .orderBy(desc(sql`COUNT(*)`), asc(checker.name));
}

// Every landing on the QC shelf, a redo after a QC reject included: each one
// needs a check.
export function listQcArrivalsByDay({ range, storeId }: RangeArgs) {
  const day = jakartaBucketExpr(qcLog.created_at, "day");
  return db
    .select({ day, arrived: sql<number>`COUNT(*)::int` })
    .from(qcLog)
    .innerJoin(
      ordersServicesTable,
      eq(qcLog.order_service_id, ordersServicesTable.id)
    )
    .innerJoin(ordersTable, eq(ordersServicesTable.order_id, ordersTable.id))
    .where(
      and(
        eq(qcLog.to_status, "waiting_qc"),
        ...timeWindow(qcLog.created_at, range),
        storeScope(ordersTable.store_id, storeId)
      )
    )
    .groupBy(day);
}

export function listQualityChecksByCheckerDay(args: RangeArgs) {
  const day = jakartaBucketExpr(qcLog.created_at, "day");
  return db
    .select({
      user_id: qcLog.changed_by,
      day,
      passes: sql<number>`(COUNT(*) FILTER (WHERE ${qcLog.to_status} = 'ready_for_pickup'))::int`,
      rejects: sql<number>`(COUNT(*) FILTER (WHERE ${qcLog.to_status} = 'qc_reject'))::int`,
    })
    .from(qcLog)
    .innerJoin(
      ordersServicesTable,
      eq(qcLog.order_service_id, ordersServicesTable.id)
    )
    .innerJoin(ordersTable, eq(ordersServicesTable.order_id, ordersTable.id))
    .where(qualityCheckInRange(qcLog, args))
    .groupBy(qcLog.changed_by, day);
}

// What sits on the QC shelf right now, whatever range the report shows. An
// Item's wait starts at its latest landing there.
export async function findWaitingQcNow(storeId: number | undefined) {
  const [row] = await db
    .select({
      count: sql<number>`COUNT(*)::int`,
      oldest_at:
        sql<Date | null>`MIN((SELECT MAX(${qcLog.created_at}) FROM ${orderServiceStatusLogsTable} AS ${sql.identifier("qc_log")} WHERE ${qcLog.order_service_id} = ${ordersServicesTable.id} AND ${qcLog.to_status} = 'waiting_qc'))`.mapWith(
          qcLog.created_at
        ),
    })
    .from(ordersServicesTable)
    .innerJoin(ordersTable, eq(ordersServicesTable.order_id, ordersTable.id))
    .where(
      and(
        eq(ordersServicesTable.status, "waiting_qc"),
        storeScope(ordersTable.store_id, storeId)
      )
    );
  return { count: row?.count ?? 0, oldest_at: row?.oldest_at ?? null };
}

// A QC reject always passes through qc_reject, never straight back to
// processing. The caller joins the log through to the Order.
interface QcRejectArgs extends RangeArgs {
  checkerId?: number;
}

export function qcRejectInRange(
  log: StatusLog,
  { range, storeId, checkerId }: QcRejectArgs
) {
  return and(
    eq(log.to_status, "qc_reject"),
    ...timeWindow(log.created_at, range),
    storeScope(ordersTable.store_id, storeId),
    checkerId === undefined ? undefined : eq(log.changed_by, checkerId)
  );
}

export async function countQcRejects(args: QcRejectArgs) {
  const [row] = await db
    .select({ total: sql<number>`COUNT(*)::int` })
    .from(qcLog)
    .innerJoin(
      ordersServicesTable,
      eq(qcLog.order_service_id, ordersServicesTable.id)
    )
    .innerJoin(ordersTable, eq(ordersServicesTable.order_id, ordersTable.id))
    .where(qcRejectInRange(qcLog, args));

  return row?.total ?? 0;
}

export function listQcRejects({
  limit,
  offset,
  ...args
}: QcRejectArgs & { limit: number; offset: number }) {
  return db
    .select({
      id: qcLog.id,
      rejected_at: qcLog.created_at,
      order_id: ordersTable.id,
      order_code: ordersTable.code,
      item_code: itemsTable.item_code,
      service_name: servicesTable.name,
      store_code: storesTable.code,
      store_name: storesTable.name,
      cleaned_by_name: sql<string | null>`(${db
        .select({ name: cleaner.name })
        .from(cleaner)
        .where(eq(cleaner.id, sql`(${cleanerOfRound(qcLog)})`))})`,
      rejected_by_name: checker.name,
      reason: qcLog.note,
    })
    .from(qcLog)
    .innerJoin(
      ordersServicesTable,
      eq(qcLog.order_service_id, ordersServicesTable.id)
    )
    .innerJoin(ordersTable, eq(ordersServicesTable.order_id, ordersTable.id))
    .innerJoin(storesTable, eq(ordersTable.store_id, storesTable.id))
    .innerJoin(itemsTable, eq(ordersServicesTable.item_id, itemsTable.id))
    .leftJoin(
      servicesTable,
      eq(ordersServicesTable.service_id, servicesTable.id)
    )
    .innerJoin(checker, eq(qcLog.changed_by, checker.id))
    .where(qcRejectInRange(qcLog, args))
    .orderBy(desc(qcLog.created_at), desc(qcLog.id))
    .limit(limit)
    .offset(offset);
}

const DAMAGED_OR_LOST = ["damaged", "lost"] as const;

export async function listDamagedLostRefunds({ range, storeId }: RangeArgs) {
  const rows = await db
    .select({
      refund_item_id: orderRefundItemsTable.id,
      refunded_at: orderRefundsTable.created_at,
      order_id: ordersTable.id,
      order_code: ordersTable.code,
      item_code: itemsTable.item_code,
      service_name: servicesTable.name,
      store_code: storesTable.code,
      reason: orderRefundItemsTable.reason,
      amount: orderRefundItemsTable.amount,
      note: orderRefundItemsTable.note,
    })
    .from(orderRefundItemsTable)
    .innerJoin(
      orderRefundsTable,
      eq(orderRefundItemsTable.order_refund_id, orderRefundsTable.id)
    )
    .innerJoin(ordersTable, eq(orderRefundsTable.order_id, ordersTable.id))
    .innerJoin(storesTable, eq(ordersTable.store_id, storesTable.id))
    .innerJoin(
      ordersServicesTable,
      eq(orderRefundItemsTable.order_service_id, ordersServicesTable.id)
    )
    .innerJoin(itemsTable, eq(ordersServicesTable.item_id, itemsTable.id))
    .leftJoin(
      servicesTable,
      eq(ordersServicesTable.service_id, servicesTable.id)
    )
    .where(
      and(
        inArray(orderRefundItemsTable.reason, [...DAMAGED_OR_LOST]),
        ...timeWindow(orderRefundsTable.created_at, range),
        storeScope(ordersTable.store_id, storeId)
      )
    )
    .orderBy(
      desc(orderRefundsTable.created_at),
      desc(orderRefundItemsTable.id)
    );

  return rows.map((row) => ({
    ...row,
    reason: row.reason as (typeof DAMAGED_OR_LOST)[number],
    amount: Number(row.amount),
  }));
}
