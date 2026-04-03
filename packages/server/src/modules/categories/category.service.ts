import type { InferInsertModel } from "drizzle-orm";
import type { categoriesTable } from "@/db/schema";
import {
  findCategoryById,
  insertCategory,
  listCategories,
  updateCategoryById,
} from "@/modules/categories/category.repository";
import type { GetCategoriesQuery } from "@/modules/categories/category.schema";

export function getCategories(query?: GetCategoriesQuery) {
  return listCategories({ is_active: query?.is_active });
}

export function getCategoryById(id: number) {
  return findCategoryById(id);
}

export async function createCategory(
  values: InferInsertModel<typeof categoriesTable>
) {
  const [category] = await insertCategory(values);
  return category;
}

export async function updateCategory(
  id: number,
  values: Partial<InferInsertModel<typeof categoriesTable>>
) {
  const [category] = await updateCategoryById(id, values);
  return category ?? null;
}
