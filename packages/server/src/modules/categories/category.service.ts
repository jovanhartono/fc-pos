import type { InferInsertModel } from "drizzle-orm";
import type { categoriesTable } from "@/db/schema";
import {
  createCategory,
  findCategoryById,
  listCategories,
  updateCategory,
} from "@/modules/categories/category.repository";
import type { GetCategoriesQuery } from "@/modules/categories/category.schema";

export function getCategories(query?: GetCategoriesQuery) {
  return listCategories({ is_active: query?.is_active });
}

export function getCategoryById(id: number) {
  return findCategoryById(id);
}

export async function createCategoryService(
  values: InferInsertModel<typeof categoriesTable>
) {
  const [category] = await createCategory(values);
  return category;
}

export async function updateCategoryService(
  id: number,
  values: Partial<InferInsertModel<typeof categoriesTable>>
) {
  const [category] = await updateCategory(id, values);
  return category ?? null;
}
