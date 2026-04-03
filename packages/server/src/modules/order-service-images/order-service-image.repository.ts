import type { InferInsertModel } from "drizzle-orm";
import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import { orderServicesImagesTable } from "@/db/schema";

interface OrderServiceImageFilters {
  order_service_id?: number;
}

export function listOrderServiceImages({
  filters,
  limit,
  offset,
}: {
  filters: OrderServiceImageFilters;
  limit: number;
  offset: number;
}) {
  return db.query.orderServicesImagesTable.findMany({
    orderBy: { id: "asc" },
    where: filters.order_service_id
      ? { order_service_id: filters.order_service_id }
      : undefined,
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

export async function countOrderServiceImages(
  filters: OrderServiceImageFilters
) {
  const whereClause = filters.order_service_id
    ? eq(orderServicesImagesTable.order_service_id, filters.order_service_id)
    : undefined;

  const rows = await db
    .select({ total: count() })
    .from(orderServicesImagesTable)
    .where(whereClause);

  return Number(rows[0]?.total ?? 0);
}

export function findOrderServiceImageById(id: number) {
  return db.query.orderServicesImagesTable.findFirst({
    where: { id },
    with: {
      orderService: true,
    },
  });
}

export function insertOrderServiceImage(
  values: InferInsertModel<typeof orderServicesImagesTable>
) {
  return db.insert(orderServicesImagesTable).values(values).returning();
}

export function updateOrderServiceImageById(
  id: number,
  values: Partial<InferInsertModel<typeof orderServicesImagesTable>>
) {
  return db
    .update(orderServicesImagesTable)
    .set(values)
    .where(eq(orderServicesImagesTable.id, id))
    .returning();
}

export function deleteOrderServiceImageById(id: number) {
  return db
    .delete(orderServicesImagesTable)
    .where(eq(orderServicesImagesTable.id, id))
    .returning({ id: orderServicesImagesTable.id });
}
