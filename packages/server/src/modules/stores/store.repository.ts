import type { InferInsertModel } from "drizzle-orm";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { storesTable } from "@/db/schema";

const findStoreByIdPrepared = db.query.storesTable
  .findFirst({
    where: { id: { eq: sql.placeholder("id") } },
  })
  .prepare("find_store_by_id");

export function findStoreById(id: number) {
  return findStoreByIdPrepared.execute({ id });
}

export function listStores() {
  return db.query.storesTable.findMany({
    orderBy: { id: "asc" },
  });
}

export function insertStore(values: InferInsertModel<typeof storesTable>) {
  return db.insert(storesTable).values(values).returning();
}

export function updateStoreById(
  id: number,
  values: Partial<InferInsertModel<typeof storesTable>>
) {
  return db
    .update(storesTable)
    .set(values)
    .where(eq(storesTable.id, id))
    .returning();
}

export function updateStoreIsActive(id: number, is_active: boolean) {
  return db
    .update(storesTable)
    .set({ is_active })
    .where(eq(storesTable.id, id))
    .returning();
}
