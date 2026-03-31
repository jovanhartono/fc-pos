import type { InferInsertModel } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { categoriesTable } from "@/db/schema";

export function listCategories(where?: { is_active?: boolean }) {
  return db.query.categoriesTable.findMany({
    orderBy: { id: "asc" },
    where:
      where?.is_active !== undefined
        ? { is_active: where.is_active }
        : undefined,
  });
}

export function findCategoryById(id: number) {
  return db.query.categoriesTable.findFirst({
    where: { id },
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
