import type { InferInsertModel } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import {
  itemsTable,
  orderCountersTable,
  ordersProductsTable,
  ordersServicesTable,
  ordersTable,
} from "@/db/schema";
import { BadRequestException } from "@/http-exceptions";
import type {
  NormalizedOrderListQuery,
  OrderListFilters,
} from "@/modules/orders/order.schema";
import {
  deriveOrderRefundStatus,
  type OrderRefundStatus,
} from "@/modules/orders/order-refund-status";
import { isNumericSearch } from "@/modules/orders/order-search";
import { summarizeOrderFulfillment } from "@/modules/orders/order-status-machine";
import { PICKUP_OVERDUE_HOURS } from "@/schema/turnaround";
import { jakartaDayEnd, jakartaDayStart, jakartaNow } from "@/utils/date";

export type OrderTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const getOrderServicePrepared = db.query.ordersServicesTable
  .findFirst({
    where: {
      order_id: { eq: sql.placeholder("order_id") },
      id: { eq: sql.placeholder("id") },
    },
  })
  .prepare("get_order_service");

const getItemPrepared = db.query.itemsTable
  .findFirst({
    where: {
      order_id: { eq: sql.placeholder("order_id") },
      id: { eq: sql.placeholder("id") },
    },
    columns: { id: true },
  })
  .prepare("get_item");

export async function getItemOrThrow(orderId: number, itemId: number) {
  const item = await getItemPrepared.execute({
    order_id: orderId,
    id: itemId,
  });

  if (!item) {
    throw new BadRequestException("Item not found for this order");
  }

  return item;
}

export async function getOrderServiceOrThrow(
  orderId: number,
  serviceId: number
) {
  const orderService = await getOrderServicePrepared.execute({
    order_id: orderId,
    id: serviceId,
  });

  if (!orderService) {
    throw new BadRequestException("Order service not found for this order");
  }

  return orderService;
}

export interface OrderListItem {
  code: string;
  created_at: Date;
  created_by: number;
  customer_id: number;
  customer_name: string;
  customer_phone: string;
  discount: string;
  fulfillment: ReturnType<typeof summarizeOrderFulfillment>;
  id: number;
  notes: string | null;
  payment_method_id: number | null;
  payment_method_name: string | null;
  payment_status: "paid" | "unpaid";
  refund_status: OrderRefundStatus;
  status:
    | "created"
    | "processing"
    | "ready_for_pickup"
    | "completed"
    | "cancelled";
  store_code: string;
  store_id: number;
  store_name: string;
  total: string;
  updated_at: Date;
  updated_by: number;
}

interface FindOrdersResult {
  items: OrderListItem[];
  total: number;
}

function buildOrderWhere(filters: OrderListFilters, scopedStoreIds?: number[]) {
  const conditions: Record<string, unknown>[] = [];

  if (scopedStoreIds !== undefined) {
    if (scopedStoreIds.length === 0) {
      conditions.push({ id: -1 });
    } else {
      conditions.push({ store_id: { in: scopedStoreIds } });
    }
  }

  if (filters.status) {
    conditions.push({ status: filters.status });
  }

  if (filters.payment_status) {
    conditions.push({ payment_status: filters.payment_status });
  }

  if (filters.overdue) {
    conditions.push({ status: "ready_for_pickup" });
    // Aged from the shelf, not from intake. A null ready_at drops out of `lt`
    // on its own, which is the wanted answer: an order nobody has finished has
    // not kept the customer waiting for a collection it could not make.
    conditions.push({
      ready_at: {
        lt: jakartaNow().subtract(PICKUP_OVERDUE_HOURS, "hour").toDate(),
      },
    });
  }

  if (filters.store_id) {
    conditions.push({ store_id: filters.store_id });
  }

  if (filters.customer_id) {
    conditions.push({ customer_id: filters.customer_id });
  }

  if (filters.created_by) {
    conditions.push({ created_by: filters.created_by });
  }

  if (filters.payment_method_id) {
    conditions.push({ payment_method_id: filters.payment_method_id });
  }

  if (filters.date_from) {
    conditions.push({
      created_at: { gte: jakartaDayStart(filters.date_from) },
    });
  }

  if (filters.date_to) {
    conditions.push({
      created_at: { lte: jakartaDayEnd(filters.date_to) },
    });
  }

  if (filters.search) {
    const search = filters.search.trim();
    const loweredSearchPrefix = `${search.toLowerCase()}%`;
    const searchPrefix = `${search}%`;

    const searchOr: Record<string, unknown>[] = [
      { code: { ilike: searchPrefix } },
      {
        customer: {
          OR: [
            { name: { ilike: loweredSearchPrefix } },
            { phone_number: { like: searchPrefix } },
          ],
        },
      },
    ];

    if (isNumericSearch(search)) {
      const numericSearch = Number(search);
      searchOr.push({ id: numericSearch });
      searchOr.push({
        services: { id: numericSearch },
      });
    }

    conditions.push({ OR: searchOr });
  }

  if (conditions.length === 0) {
    return;
  }
  if (conditions.length === 1) {
    return conditions[0];
  }
  return { AND: conditions };
}

export async function findOrders(
  filters: NormalizedOrderListQuery,
  scopedStoreIds?: number[]
): Promise<FindOrdersResult> {
  const [rows, total] = await Promise.all([
    db.query.ordersTable.findMany({
      columns: {
        id: true,
        code: true,
        status: true,
        payment_status: true,
        paid_amount: true,
        refunded_amount: true,
        discount: true,
        total: true,
        notes: true,
        created_at: true,
        updated_at: true,
        customer_id: true,
        store_id: true,
        payment_method_id: true,
        created_by: true,
        updated_by: true,
      },
      with: {
        customer: {
          columns: {
            name: true,
            phone_number: true,
          },
        },
        store: {
          columns: {
            code: true,
            name: true,
          },
        },
        paymentMethod: {
          columns: {
            name: true,
          },
        },
      },
      where: buildOrderWhere(filters, scopedStoreIds),
      orderBy:
        filters.sort_by === "id"
          ? { id: filters.sort_order }
          : {
              [filters.sort_by]: filters.sort_order,
              id: filters.sort_order,
            },
      limit: filters.limit,
      offset: filters.offset,
    }),
    countOrders(filters, scopedStoreIds),
  ]);

  const orderIds = rows.map((row) => row.id);
  const serviceRows =
    orderIds.length === 0
      ? []
      : await db.query.ordersServicesTable.findMany({
          where: { order_id: { in: orderIds } },
          columns: {
            order_id: true,
            status: true,
          },
        });

  const groupedStatuses = new Map<
    number,
    (typeof serviceRows)[number]["status"][]
  >();

  for (const row of serviceRows) {
    if (row.order_id === null) {
      continue;
    }

    const current = groupedStatuses.get(row.order_id) ?? [];
    current.push(row.status);
    groupedStatuses.set(row.order_id, current);
  }

  const items: OrderListItem[] = rows.map((row) => ({
    id: row.id,
    code: row.code,
    status: row.status,
    payment_status: row.payment_status,
    refund_status: deriveOrderRefundStatus({
      paid_amount: row.paid_amount,
      refunded_amount: row.refunded_amount,
    }),
    discount: row.discount,
    total: row.total,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
    customer_id: row.customer_id,
    customer_name: row.customer.name,
    customer_phone: row.customer.phone_number,
    store_id: row.store_id,
    store_code: row.store.code,
    store_name: row.store.name,
    payment_method_id: row.payment_method_id,
    payment_method_name: row.paymentMethod?.name ?? null,
    created_by: row.created_by,
    updated_by: row.updated_by,
    fulfillment: summarizeOrderFulfillment(groupedStatuses.get(row.id) ?? []),
  }));

  return {
    items,
    total,
  };
}

// Postgres does the counting and hands back one row. db.$count() cannot take the
// relational builder's object `where`, and a second SQL-level where-builder is
// how a pill's number stops matching the total of the page it opens — so the
// count rides along on buildOrderWhere itself. The window runs before LIMIT, so
// the single row carries the count of every match, not of the row returned.
export async function countOrders(
  filters: OrderListFilters,
  scopedStoreIds?: number[]
): Promise<number> {
  const [row] = await db.query.ordersTable.findMany({
    where: buildOrderWhere(filters, scopedStoreIds),
    columns: { id: true },
    extras: { total: sql<number>`(count(*) over ())::int`.as("total") },
    limit: 1,
  });
  // No row means nothing matched — the window had nothing to report it on.
  return row?.total ?? 0;
}

export async function reserveNextOrderNumber(
  tx: OrderTx,
  storeCode: string,
  dateStr: string
): Promise<number> {
  const [counter] = await tx
    .insert(orderCountersTable)
    .values({
      store_code: storeCode,
      date_str: dateStr,
      last_number: 1,
    })
    .onConflictDoUpdate({
      target: [orderCountersTable.store_code, orderCountersTable.date_str],
      set: {
        last_number: sql`${orderCountersTable.last_number} + 1`,
      },
    })
    .returning({
      last_number: orderCountersTable.last_number,
    });

  return counter.last_number;
}

export async function insertOrder(
  tx: OrderTx,
  values: InferInsertModel<typeof ordersTable>
): Promise<number> {
  const [created] = await tx
    .insert(ordersTable)
    .values(values)
    .returning({ id: ordersTable.id });

  return created.id;
}

// Returns the new id beside the tag it was inserted with, so the caller can
// pair each treatment with the object it was sold against by matching on
// `item_code` — which carries a unique index — rather than trusting the order
// RETURNING happens to hand rows back in. Attaching a treatment to the wrong
// object would put the wrong tag on the wrong shoe, and no constraint can catch
// it: any (order_id, item_id) pair inside one Order satisfies the composite FK
// (ADR-0017).
export async function insertItems(
  tx: OrderTx,
  values: InferInsertModel<typeof itemsTable>[]
): Promise<{ id: number; item_code: string }[]> {
  if (values.length === 0) {
    return [];
  }

  return await tx
    .insert(itemsTable)
    .values(values)
    .returning({ id: itemsTable.id, item_code: itemsTable.item_code });
}

export async function insertOrderServices(
  tx: OrderTx,
  values: InferInsertModel<typeof ordersServicesTable>[]
): Promise<number> {
  if (values.length === 0) {
    return 0;
  }

  const inserted = await tx
    .insert(ordersServicesTable)
    .values(values)
    .returning({ subtotal: ordersServicesTable.subtotal });

  return inserted.reduce((sum, row) => sum + Number(row.subtotal ?? 0), 0);
}

export async function insertOrderProducts(
  tx: OrderTx,
  values: InferInsertModel<typeof ordersProductsTable>[]
): Promise<number> {
  if (values.length === 0) {
    return 0;
  }

  const inserted = await tx
    .insert(ordersProductsTable)
    .values(values)
    .returning({ subtotal: ordersProductsTable.subtotal });

  return inserted.reduce((sum, row) => sum + Number(row.subtotal ?? 0), 0);
}
