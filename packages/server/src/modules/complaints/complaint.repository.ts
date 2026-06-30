import { and, desc, eq, ilike, inArray, isNotNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  complaintsTable,
  customersTable,
  ordersServicesTable,
  ordersTable,
  servicesTable,
  storesTable,
  usersTable,
} from "@/db/schema";
import type { NormalizedComplaintListQuery } from "@/modules/complaints/complaint.schema";
import type { DbExecutor } from "@/modules/orders/order-status-machine";

type ComplaintInsert = typeof complaintsTable.$inferInsert;
type ReworkLineInsert = typeof ordersServicesTable.$inferInsert;

export async function insertComplaint(
  executor: DbExecutor,
  values: ComplaintInsert
) {
  const [created] = await executor
    .insert(complaintsTable)
    .values(values)
    .returning();
  return created;
}

// One complaint per original line, lifetime (ADR-0013 amendment).
export function findComplaintForService(serviceId: number) {
  return db.query.complaintsTable.findFirst({
    where: { order_service_id: serviceId },
  });
}

export function findComplaintById(id: number) {
  return db.query.complaintsTable.findFirst({
    where: { id },
  });
}

// The complained line plus the order context needed to spawn a rework.
export function findComplaintSubjectService(serviceId: number) {
  return db.query.ordersServicesTable.findFirst({
    where: { id: serviceId },
    with: { order: true },
  });
}

export function countReworkLinesForOrder(
  executor: DbExecutor,
  orderId: number
) {
  return executor.$count(
    ordersServicesTable,
    and(
      eq(ordersServicesTable.order_id, orderId),
      isNotNull(ordersServicesTable.complaint_id)
    )
  );
}

export async function insertReworkLine(
  executor: DbExecutor,
  values: ReworkLineInsert
) {
  const [created] = await executor
    .insert(ordersServicesTable)
    .values(values)
    .returning();
  return created;
}

export function findComplaintDetailById(id: number) {
  return db.query.complaintsTable.findFirst({
    where: { id },
    with: {
      orderService: {
        with: {
          service: { columns: { id: true, name: true } },
          order: {
            columns: {
              id: true,
              code: true,
              store_id: true,
              status: true,
              payment_status: true,
            },
            with: {
              customer: {
                columns: { id: true, name: true, phone_number: true },
              },
              store: { columns: { id: true, name: true } },
            },
          },
        },
      },
      reworkLines: {
        columns: {
          id: true,
          status: true,
          item_code: true,
        },
        with: {
          service: { columns: { id: true, name: true } },
          handler: { columns: { id: true, name: true } },
        },
        orderBy: { id: "asc" },
      },
      openedBy: { columns: { id: true, name: true } },
    },
  });
}

function buildComplaintListFilters(
  normalized: NormalizedComplaintListQuery,
  scopedStoreIds?: number[]
) {
  const search = normalized.search;
  return and(
    normalized.store_id
      ? eq(ordersTable.store_id, normalized.store_id)
      : undefined,
    scopedStoreIds ? inArray(ordersTable.store_id, scopedStoreIds) : undefined,
    search
      ? or(
          ilike(ordersTable.code, `%${search}%`),
          ilike(customersTable.name, `%${search}%`),
          ilike(customersTable.phone_number, `%${search}%`)
        )
      : undefined
  );
}

export async function findComplaints(
  normalized: NormalizedComplaintListQuery,
  scopedStoreIds?: number[]
) {
  const filters = buildComplaintListFilters(normalized, scopedStoreIds);

  const [items, [counted]] = await Promise.all([
    db
      .select({
        id: complaintsTable.id,
        reason: complaintsTable.reason,
        created_at: complaintsTable.created_at,
        // Outcome is derived from the lines (ADR-0013 amendment): the subject
        // line's status (refunded?) plus whether any rework line points back.
        subject_status: ordersServicesTable.status,
        rework_count: sql<number>`(SELECT count(*)::int FROM orders_services rw WHERE rw.complaint_id = ${complaintsTable.id})`,
        order_id: ordersTable.id,
        order_code: ordersTable.code,
        store_id: ordersTable.store_id,
        store_name: storesTable.name,
        customer_name: customersTable.name,
        service_name: servicesTable.name,
        opened_by_name: usersTable.name,
      })
      .from(complaintsTable)
      .innerJoin(
        ordersServicesTable,
        eq(complaintsTable.order_service_id, ordersServicesTable.id)
      )
      .innerJoin(ordersTable, eq(ordersServicesTable.order_id, ordersTable.id))
      .innerJoin(customersTable, eq(ordersTable.customer_id, customersTable.id))
      .innerJoin(storesTable, eq(ordersTable.store_id, storesTable.id))
      .leftJoin(
        servicesTable,
        eq(ordersServicesTable.service_id, servicesTable.id)
      )
      .innerJoin(usersTable, eq(complaintsTable.opened_by, usersTable.id))
      .where(filters)
      .orderBy(desc(complaintsTable.id))
      .limit(normalized.limit)
      .offset(normalized.offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(complaintsTable)
      .innerJoin(
        ordersServicesTable,
        eq(complaintsTable.order_service_id, ordersServicesTable.id)
      )
      .innerJoin(ordersTable, eq(ordersServicesTable.order_id, ordersTable.id))
      .innerJoin(customersTable, eq(ordersTable.customer_id, customersTable.id))
      .where(filters),
  ]);

  return { items, total: counted?.count ?? 0 };
}
