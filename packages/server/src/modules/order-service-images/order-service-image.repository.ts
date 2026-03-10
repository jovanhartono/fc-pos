import type { InferInsertModel } from "drizzle-orm";
import { and, asc, count, eq, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { orderServicesImagesTable } from "@/db/schema";

export function buildOrderServiceImagesWhereClause(filters: {
  order_service_id?: number;
}) {
  const conditions: SQL[] = [];

  if (filters.order_service_id !== undefined) {
    conditions.push(
      eq(orderServicesImagesTable.order_service_id, filters.order_service_id)
    );
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

export function listOrderServiceImages({
  whereClause,
  limit,
  offset,
}: {
  whereClause?: SQL;
  limit: number;
  offset: number;
}) {
  return db.query.orderServicesImagesTable.findMany({
    orderBy: [asc(orderServicesImagesTable.id)],
    where: whereClause,
    limit,
    offset,
    with: {
      orderService: {
        columns: {
          id: true,
          order_id: true,
          service_id: true,
        },
      },
    },
  });
}

export async function countOrderServiceImages(whereClause?: SQL) {
  const rows = await db
    .select({ total: count() })
    .from(orderServicesImagesTable)
    .where(whereClause);

  return Number(rows[0]?.total ?? 0);
}

export function findOrderServiceImageById(id: number) {
  return db.query.orderServicesImagesTable.findFirst({
    where: eq(orderServicesImagesTable.id, id),
    with: {
      orderService: true,
    },
  });
}

export function createOrderServiceImage(
  values: InferInsertModel<typeof orderServicesImagesTable>
) {
  return db.insert(orderServicesImagesTable).values(values).returning();
}

export function updateOrderServiceImage(
  id: number,
  values: Partial<InferInsertModel<typeof orderServicesImagesTable>>
) {
  return db
    .update(orderServicesImagesTable)
    .set(values)
    .where(eq(orderServicesImagesTable.id, id))
    .returning();
}

export function deleteOrderServiceImage(id: number) {
  return db
    .delete(orderServicesImagesTable)
    .where(eq(orderServicesImagesTable.id, id))
    .returning({ id: orderServicesImagesTable.id });
}
