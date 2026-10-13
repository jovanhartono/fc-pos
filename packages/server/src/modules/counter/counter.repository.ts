import { and, asc, desc, eq, gte, inArray, min, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  categoriesTable,
  complaintsTable,
  customersTable,
  itemsTable,
  orderServiceStatusLogsTable,
  ordersServicesTable,
  ordersTable,
  servicesTable,
} from "@/db/schema";
import { REWORKED_ROUND_STATUSES } from "@/modules/complaints/complaint.schema";
import type { DateRange } from "@/modules/reports/report-range.util";
import { listServicesProcessed } from "@/modules/reports/services-processed";

const WAITING_STATUSES = ["queued", "processing", "qc_reject"] as const;

export async function findFirstOrderCreatedAt(storeId: number) {
  const [row] = await db
    .select({ first: min(ordersTable.created_at) })
    .from(ordersTable)
    .where(eq(ordersTable.store_id, storeId));

  return row?.first ?? null;
}

export function listProcessedByCategory(storeId: number, range: DateRange) {
  const processed = listServicesProcessed({ range, storeId }).as("processed");

  return db
    .select({
      category_id: servicesTable.category_id,
      processed_at: processed.processed_at,
    })
    .from(processed)
    .innerJoin(
      ordersServicesTable,
      eq(processed.order_service_id, ordersServicesTable.id)
    )
    .innerJoin(
      servicesTable,
      eq(ordersServicesTable.service_id, servicesTable.id)
    );
}

export function listWaitingLines(storeId: number) {
  return db
    .select({
      category_id: categoriesTable.id,
      category_name: categoriesTable.name,
      is_priority: ordersServicesTable.is_priority,
      item_code: itemsTable.item_code,
      item_id: ordersServicesTable.item_id,
      line_id: ordersServicesTable.id,
      order_created_at: ordersTable.created_at,
      order_id: ordersTable.id,
      starts_after_cleaning: categoriesTable.starts_after_cleaning,
      status: ordersServicesTable.status,
    })
    .from(ordersServicesTable)
    .innerJoin(ordersTable, eq(ordersServicesTable.order_id, ordersTable.id))
    .innerJoin(itemsTable, eq(ordersServicesTable.item_id, itemsTable.id))
    .innerJoin(
      servicesTable,
      eq(ordersServicesTable.service_id, servicesTable.id)
    )
    .innerJoin(
      categoriesTable,
      eq(servicesTable.category_id, categoriesTable.id)
    )
    .where(
      and(
        eq(ordersTable.store_id, storeId),
        inArray(ordersServicesTable.status, [...WAITING_STATUSES])
      )
    );
}

// Non-Priority lines started from the queue since `since`, for the "newer
// went first" count.
export function listStartedLines(storeId: number, since: Date) {
  return db
    .select({
      category_id: servicesTable.category_id,
      order_created_at: ordersTable.created_at,
      started_at: orderServiceStatusLogsTable.created_at,
    })
    .from(ordersServicesTable)
    .innerJoin(ordersTable, eq(ordersServicesTable.order_id, ordersTable.id))
    .innerJoin(
      servicesTable,
      eq(ordersServicesTable.service_id, servicesTable.id)
    )
    .innerJoin(
      orderServiceStatusLogsTable,
      eq(orderServiceStatusLogsTable.order_service_id, ordersServicesTable.id)
    )
    .where(
      and(
        eq(ordersTable.store_id, storeId),
        eq(ordersServicesTable.is_priority, false),
        eq(orderServiceStatusLogsTable.from_status, "queued"),
        eq(orderServiceStatusLogsTable.to_status, "processing"),
        gte(orderServiceStatusLogsTable.created_at, since)
      )
    );
}

// When each Item's cleaning was last finished: the latest first quality check
// across its cleaning lines. An after-clean line could not start before then.
export function listCleaningDoneAt(itemIds: number[]) {
  const firstChecks = db
    .select({
      checked_at: min(orderServiceStatusLogsTable.created_at).as("checked_at"),
      item_id: ordersServicesTable.item_id,
    })
    .from(ordersServicesTable)
    .innerJoin(
      servicesTable,
      eq(ordersServicesTable.service_id, servicesTable.id)
    )
    .innerJoin(
      categoriesTable,
      eq(servicesTable.category_id, categoriesTable.id)
    )
    .innerJoin(
      orderServiceStatusLogsTable,
      eq(orderServiceStatusLogsTable.order_service_id, ordersServicesTable.id)
    )
    .where(
      and(
        inArray(ordersServicesTable.item_id, itemIds),
        eq(categoriesTable.starts_after_cleaning, false),
        eq(orderServiceStatusLogsTable.to_status, "quality_check")
      )
    )
    .groupBy(ordersServicesTable.id, ordersServicesTable.item_id)
    .as("first_checks");

  return db
    .select({
      done_at: sql<Date>`MAX(${firstChecks.checked_at})`.mapWith(
        orderServiceStatusLogsTable.created_at
      ),
      item_id: firstChecks.item_id,
    })
    .from(firstChecks)
    .groupBy(firstChecks.item_id);
}

// The latest QC reject on each line: when, and the note the checker left.
export function listLatestQcRejects(lineIds: number[]) {
  return db
    .selectDistinctOn([orderServiceStatusLogsTable.order_service_id], {
      created_at: orderServiceStatusLogsTable.created_at,
      line_id: orderServiceStatusLogsTable.order_service_id,
      note: orderServiceStatusLogsTable.note,
    })
    .from(orderServiceStatusLogsTable)
    .where(
      and(
        inArray(orderServiceStatusLogsTable.order_service_id, lineIds),
        eq(orderServiceStatusLogsTable.to_status, "qc_reject")
      )
    )
    .orderBy(
      orderServiceStatusLogsTable.order_service_id,
      desc(orderServiceStatusLogsTable.created_at)
    );
}

// A Complaint is undecided while its line is still live and no Rework round
// that was not cancelled exists (ADR-0013 amendment).
export function listUndecidedComplaints(storeId: number) {
  return db
    .select({
      category_name: categoriesTable.name,
      complaint_id: complaintsTable.id,
      created_at: complaintsTable.created_at,
      item_code: itemsTable.item_code,
      reason: complaintsTable.reason,
    })
    .from(complaintsTable)
    .innerJoin(
      ordersServicesTable,
      eq(complaintsTable.order_service_id, ordersServicesTable.id)
    )
    .innerJoin(ordersTable, eq(ordersServicesTable.order_id, ordersTable.id))
    .innerJoin(itemsTable, eq(ordersServicesTable.item_id, itemsTable.id))
    .innerJoin(
      servicesTable,
      eq(ordersServicesTable.service_id, servicesTable.id)
    )
    .innerJoin(
      categoriesTable,
      eq(servicesTable.category_id, categoriesTable.id)
    )
    .where(
      and(
        eq(ordersTable.store_id, storeId),
        sql`${ordersServicesTable.status} NOT IN ('refunded', 'cancelled')`,
        sql`NOT EXISTS (SELECT 1 FROM orders_services rw WHERE rw.complaint_id = ${complaintsTable.id} AND rw.status IN ${REWORKED_ROUND_STATUSES})`
      )
    )
    .orderBy(asc(complaintsTable.created_at));
}

// Only Items still on the shelf count: one the Customer already took home
// from a part pickup, or one cancelled or refunded, is not there.
const shelfLineOfOrder = and(
  eq(ordersServicesTable.order_id, ordersTable.id),
  eq(ordersServicesTable.status, "ready_for_pickup")
);

export function listPickupShelf(storeId: number) {
  return db
    .select({
      customer_name: customersTable.name,
      customer_phone: customersTable.phone_number,
      items: sql<number>`COUNT(DISTINCT ${ordersServicesTable.item_id})::int`,
      order_id: ordersTable.id,
      ready_at: ordersTable.ready_at,
    })
    .from(ordersTable)
    .innerJoin(customersTable, eq(ordersTable.customer_id, customersTable.id))
    .leftJoin(ordersServicesTable, shelfLineOfOrder)
    .where(
      and(
        eq(ordersTable.store_id, storeId),
        eq(ordersTable.status, "ready_for_pickup")
      )
    )
    .groupBy(ordersTable.id, customersTable.id)
    .orderBy(asc(ordersTable.ready_at), asc(ordersTable.id));
}
