import { and, desc, eq, exists, ilike, inArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/db";
import type { DbExecutor } from "@/db";
import {
  complaintsTable,
  customersTable,
  itemsTable,
  ordersServicesTable,
  ordersTable,
  servicesTable,
  storesTable,
  usersTable,
} from "@/db/schema";
import { REWORKED_ROUND_STATUSES } from "@/modules/complaints/complaint.schema";
import type { NormalizedComplaintListQuery } from "@/modules/complaints/complaint.schema";
import {
  itemNameColumns,
  orderRefColumns,
} from "@/modules/orders/order-read.repository";

type ComplaintInsert = typeof complaintsTable.$inferInsert;

const reworkLine = alias(ordersServicesTable, "rework_line");

// The Complaints page, the Counter and the reports all call a Complaint
// reworked by this one test, so they never disagree about the same Item.
export const hasLiveRework = sql<boolean>`${exists(
  db
    .select({ id: reworkLine.id })
    .from(reworkLine)
    .where(
      and(
        eq(reworkLine.complaint_id, complaintsTable.id),
        inArray(reworkLine.status, REWORKED_ROUND_STATUSES)
      )
    )
)}`;

export const insertComplaint = async (
  executor: DbExecutor,
  values: ComplaintInsert
) => {
  const [created] = await executor
    .insert(complaintsTable)
    .values(values)
    .returning();
  return created;
};

// One complaint per original line, lifetime (ADR-0013 amendment).
export const findComplaintForService = (
  executor: DbExecutor,
  serviceId: number
) =>
  executor.query.complaintsTable.findFirst({
    where: { order_service_id: serviceId },
  });

export const findComplaintById = (id: number) =>
  db.query.complaintsTable.findFirst({
    where: { id },
  });

export const findComplaintSubjectService = (serviceId: number) =>
  db.query.ordersServicesTable.findFirst({
    where: { id: serviceId },
    with: { order: { columns: orderRefColumns } },
  });

// Another cashier may hand over, cancel or refund this Item meanwhile. The Order
// is held first, as a refund holds it, so the two queue up instead of deadlocking.
export const lockOrderServiceState = async (
  executor: DbExecutor,
  { orderId, serviceId }: { orderId: number; serviceId: number }
) => {
  await executor
    .select({ id: ordersTable.id })
    .from(ordersTable)
    .where(eq(ordersTable.id, orderId))
    .for("key share");

  const [locked] = await executor
    .select({
      complaint_id: ordersServicesTable.complaint_id,
      status: ordersServicesTable.status,
    })
    .from(ordersServicesTable)
    .where(eq(ordersServicesTable.id, serviceId))
    .for("update");
  return locked;
};

// Every OrderService on the Item, Rework lines included.
export const findItemLines = (executor: DbExecutor, itemId: number) =>
  executor.query.ordersServicesTable.findMany({
    where: { item_id: itemId },
    columns: { complaint_id: true, status: true },
  });

export const findComplaintDetailById = (id: number) =>
  db.query.complaintsTable.findFirst({
    where: { id },
    with: {
      orderService: {
        with: {
          service: { columns: { id: true, name: true } },
          // The Item code and descriptors live on the Item, which Rework lines
          // share, so this covers them too (ADR-0017).
          item: {
            columns: {
              id: true,
              item_code: true,
              brand: true,
              color: true,
              model: true,
              size: true,
            },
          },
          order: {
            columns: orderRefColumns,
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
        },
        with: {
          service: { columns: { id: true, name: true } },
          handler: { columns: { id: true, name: true } },
          // When the round reached the status it shows.
          statusLogs: {
            columns: { created_at: true },
            orderBy: { id: "desc" },
            limit: 1,
          },
        },
        orderBy: { id: "asc" },
      },
      openedBy: { columns: { id: true, name: true } },
    },
  });

const buildComplaintListFilters = (
  normalized: NormalizedComplaintListQuery,
  scopedStoreIds?: number[]
) => {
  const { search } = normalized;
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
};

export const findComplaints = async (
  normalized: NormalizedComplaintListQuery,
  scopedStoreIds?: number[]
) => {
  const filters = buildComplaintListFilters(normalized, scopedStoreIds);

  const [items, [counted]] = await Promise.all([
    db
      .select({
        id: complaintsTable.id,
        reason: complaintsTable.reason,
        created_at: complaintsTable.created_at,
        // Outcome is derived from the lines (ADR-0013 amendment): the subject
        // line's status plus its reworks.
        subject_status: ordersServicesTable.status,
        has_live_rework: hasLiveRework,
        order_id: ordersTable.id,
        order_code: ordersTable.code,
        store_id: ordersTable.store_id,
        store_name: storesTable.name,
        customer_id: ordersTable.customer_id,
        customer_name: customersTable.name,
        service_name: servicesTable.name,
        ...itemNameColumns,
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
      .innerJoin(itemsTable, eq(ordersServicesTable.item_id, itemsTable.id))
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
};
