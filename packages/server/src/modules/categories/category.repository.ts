import type { InferInsertModel } from "drizzle-orm";
import { asc, eq, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { categoriesTable } from "@/db/schema";

export function listCategories(whereClause?: SQL) {
  return db.query.categoriesTable.findMany({
    orderBy: [asc(categoriesTable.id)],
    where: whereClause,
  });
}

export function findCategoryById(id: number) {
  return db.query.categoriesTable.findFirst({
    where: eq(categoriesTable.id, id),
  });
}

export function createCategory(
  values: InferInsertModel<typeof categoriesTable>
) {
  return db.insert(categoriesTable).values(values).returning();
}

export function updateCategory(
  id: number,
  values: Partial<InferInsertModel<typeof categoriesTable>>
) {
  return db
    .update(categoriesTable)
    .set(values)
    .where(eq(categoriesTable.id, id))
    .returning();
}
