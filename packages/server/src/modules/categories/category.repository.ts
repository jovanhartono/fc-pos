import type { InferInsertModel } from "drizzle-orm";
import { EmptyFilter, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { categoriesTable } from "@/db/schema";

export const listCategories = (where?: { is_active?: boolean }) =>
  db.query.categoriesTable.findMany({
    orderBy: { id: "asc" },
    where: { is_active: where?.is_active ?? EmptyFilter },
  });

const findCategoryByIdPrepared = db.query.categoriesTable
  .findFirst({
    where: { id: { eq: sql.placeholder("id") } },
  })
  .prepare("find_category_by_id");

export const findCategoryById = (id: number) =>
  findCategoryByIdPrepared.execute({ id });

export const insertCategory = (
  values: InferInsertModel<typeof categoriesTable>
) => db.insert(categoriesTable).values(values).returning();

export const updateCategoryById = (
  id: number,
  values: Partial<InferInsertModel<typeof categoriesTable>>
) =>
  db
    .update(categoriesTable)
    .set(values)
    .where(eq(categoriesTable.id, id))
    .returning();
