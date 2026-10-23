import type { InferInsertModel } from "drizzle-orm";
import { EmptyFilter, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { categoriesTable } from "@/db/schema";

export function listCategories(where?: { is_active?: boolean }) {
  return db.query.categoriesTable.findMany({
    orderBy: { id: "asc" },
    where: { is_active: where?.is_active ?? EmptyFilter },
  });
}

const findCategoryByIdPrepared = db.query.categoriesTable
  .findFirst({
    where: { id: { eq: sql.placeholder("id") } },
  })
  .prepare("find_category_by_id");

export function findCategoryById(id: number) {
  return findCategoryByIdPrepared.execute({ id });
}

export function insertCategory(
  values: InferInsertModel<typeof categoriesTable>
) {
  return db.insert(categoriesTable).values(values).returning();
}

export function updateCategoryById(
  id: number,
  values: Partial<InferInsertModel<typeof categoriesTable>>
) {
  return db
    .update(categoriesTable)
    .set(values)
    .where(eq(categoriesTable.id, id))
    .returning();
}
