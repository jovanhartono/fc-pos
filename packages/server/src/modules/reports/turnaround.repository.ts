import { and, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { alias, type PgColumn } from "drizzle-orm/pg-core";
import { db } from "@/db";
import {
  categoriesTable,
  itemsTable,
  orderServiceStatusLogsTable,
  ordersServicesTable,
  ordersTable,
  servicesTable,
  storesTable,
} from "@/db/schema";
import {
  type RangeArgs,
  storeScope,
  timeWindow,
} from "@/modules/reports/money-basis";

const logs = orderServiceStatusLogsTable;

// The first time a line reached a status; a line sent back and redone keeps
// the moment it was first ready, which is when the Customer could have collected.
const firstReachedAt = (
  lineId: PgColumn,
  status: "processing" | "ready_for_pickup"
) =>
  sql<Date | null>`(SELECT MIN(${logs.created_at}) FROM ${logs} WHERE ${logs.order_service_id} = ${lineId} AND ${logs.to_status} = ${status})`.mapWith(
    logs.created_at
  );

const readyAt = firstReachedAt(ordersServicesTable.id, "ready_for_pickup");

const shelfLog = alias(orderServiceStatusLogsTable, "shelf_log");
const nextLog = alias(orderServiceStatusLogsTable, "next_log");

// Every stretch on the QC shelf before the line was first ready, a wait after
// a QC reject included; each ends at the line's next status change.
const waitingQcHours =
  sql<number>`(SELECT COALESCE(SUM(EXTRACT(EPOCH FROM ((SELECT MIN(${nextLog.created_at}) FROM ${logs} AS ${sql.identifier("next_log")} WHERE ${nextLog.order_service_id} = ${shelfLog.order_service_id} AND ${nextLog.created_at} > ${shelfLog.created_at}) - ${shelfLog.created_at}))), 0) / 3600 FROM ${logs} AS ${sql.identifier("shelf_log")} WHERE ${shelfLog.order_service_id} = ${ordersServicesTable.id} AND ${shelfLog.to_status} = 'waiting_qc' AND ${shelfLog.created_at} < ${readyAt})`.mapWith(
    Number
  );

// Every first-round line of every Item that had a line become ready in the
// stretch. An Item's ready day is its last line's, so any Item that lands in
// the stretch has at least one line in it.
export async function listTurnaroundLines({ range, storeId }: RangeArgs) {
  const readyInRange = db
    .select({ item_id: ordersServicesTable.item_id })
    .from(ordersServicesTable)
    .innerJoin(ordersTable, eq(ordersServicesTable.order_id, ordersTable.id))
    .innerJoin(logs, eq(logs.order_service_id, ordersServicesTable.id))
    .where(
      and(
        eq(logs.to_status, "ready_for_pickup"),
        ...timeWindow(logs.created_at, range),
        storeScope(ordersTable.store_id, storeId)
      )
    );

  return await db
    .select({
      item_id: ordersServicesTable.item_id,
      is_priority: ordersServicesTable.is_priority,
      category_id: categoriesTable.id,
      category_name: categoriesTable.name,
      service_name: servicesTable.name,
      store_code: storesTable.code,
      order_created_at: ordersTable.created_at,
      processing_at: firstReachedAt(ordersServicesTable.id, "processing").as(
        "processing_at"
      ),
      ready_at: readyAt.as("ready_at"),
      waiting_qc_hours: waitingQcHours.as("waiting_qc_hours"),
    })
    .from(ordersServicesTable)
    .innerJoin(itemsTable, eq(ordersServicesTable.item_id, itemsTable.id))
    .innerJoin(ordersTable, eq(ordersServicesTable.order_id, ordersTable.id))
    .innerJoin(storesTable, eq(ordersTable.store_id, storesTable.id))
    .leftJoin(
      servicesTable,
      eq(ordersServicesTable.service_id, servicesTable.id)
    )
    .leftJoin(
      categoriesTable,
      eq(servicesTable.category_id, categoriesTable.id)
    )
    .where(
      and(
        isNull(ordersServicesTable.complaint_id),
        notInArray(ordersServicesTable.status, ["refunded", "cancelled"]),
        inArray(ordersServicesTable.item_id, readyInRange)
      )
    );
}
