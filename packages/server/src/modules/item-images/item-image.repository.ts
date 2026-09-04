import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { itemImagesTable } from "@/db/schema";

export function softDeleteItemImageById(id: number, userId: number) {
  return db
    .update(itemImagesTable)
    .set({ deleted_at: new Date(), deleted_by: userId })
    .where(and(eq(itemImagesTable.id, id), isNull(itemImagesTable.deleted_at)))
    .returning({ id: itemImagesTable.id });
}
