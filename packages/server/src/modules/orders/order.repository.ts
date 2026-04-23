import type { InferInsertModel } from "drizzle-orm";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  orderCountersTable,
  ordersProductsTable,
  ordersServicesTable,
  ordersTable,
} from "@/db/schema";
import type { NormalizedOrderListQuery } from "@/modules/orders/order.schema";
import { summarizeOrderFulfillment } from "@/modules/orders/order-fulfillment";
import { jakartaDayEnd, jakartaDayStart } from "@/utils/date";

export type OrderTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface OrderListItem {
  id: number;
  code: string;
  status:
    | "created"
    | "processing"
    | "ready_for_pickup"
    | "completed"
    | "cancelled";
  payment_status: "paid" | "unpaid";
  discount: string;
  total: string | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
  customer_id: number;
  customer_name: string;
  customer_phone: string;
  store_id: number;
  store_code: string;
  store_name: string;
  payment_method_id: number | null;
  payment_method_name: string | null;
  created_by: number;
  updated_by: number;
  fulfillment: ReturnType<typeof summarizeOrderFulfillment>;
}

interface FindOrdersResult {
  items: OrderListItem[];
  total: number;
}

const numericSearchRegex = /^\d+$/;

function buildOrderWhere(
  filters: NormalizedOrderListQuery,
  scopedStoreIds?: number[]
) {
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

    if (numericSearchRegex.test(search)) {
      const numericSearch = Number(search);
      searchOr.push({ id: numericSearch });
      searchOr.push({
        services: { id: numericSearch },
      });
    }

    conditions.push({ OR: searchOr });
  }

  if (conditions.length === 0) {
    return undefined;
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
    db.query.ordersTable
      .findMany({
        where: buildOrderWhere(filters, scopedStoreIds),
        columns: { id: true },
      })
      .then((rows) => rows.length),
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

export function updateOrderTotal(tx: OrderTx, orderId: number, total: number) {
  return tx
    .update(ordersTable)
    .set({ total: total.toString() })
    .where(eq(ordersTable.id, orderId));
}
