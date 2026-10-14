import { and, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
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
      category_name: categoriesTable.name,
      service_name: servicesTable.name,
      store_code: storesTable.code,
      order_created_at: ordersTable.created_at,
      processing_at: firstReachedAt(ordersServicesTable.id, "processing").as(
        "processing_at"
      ),
      ready_at: readyAt.as("ready_at"),
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
