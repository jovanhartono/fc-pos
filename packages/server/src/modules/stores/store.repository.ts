import type { InferInsertModel } from "drizzle-orm";
import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { storesTable } from "@/db/schema";

const findStoreByIdPrepared = db.query.storesTable
  .findFirst({
    where: { id: { eq: sql.placeholder("id") } },
  })
  .prepare("find_store_by_id");

export const findStoreById = (id: number) =>
  findStoreByIdPrepared.execute({ id });

export const listStores = () =>
  db.query.storesTable.findMany({
    orderBy: { id: "asc" },
  });

export const insertStore = (values: InferInsertModel<typeof storesTable>) =>
  db.insert(storesTable).values(values).returning();

export const updateStoreById = (
  id: number,
  values: Partial<InferInsertModel<typeof storesTable>>
) =>
  db.update(storesTable).set(values).where(eq(storesTable.id, id)).returning();

export const updateStoreIsActive = (id: number, is_active: boolean) =>
  db
    .update(storesTable)
    .set({ is_active })
    .where(eq(storesTable.id, id))
    .returning();
