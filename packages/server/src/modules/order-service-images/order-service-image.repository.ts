import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { orderServicesImagesTable } from "@/db/schema";

export function softDeleteOrderServiceImageById(id: number, userId: number) {
  return db
    .update(orderServicesImagesTable)
    .set({ deleted_at: new Date(), deleted_by: userId })
    .where(
      and(
        eq(orderServicesImagesTable.id, id),
        isNull(orderServicesImagesTable.deleted_at)
      )
    )
    .returning({ id: orderServicesImagesTable.id });
}
