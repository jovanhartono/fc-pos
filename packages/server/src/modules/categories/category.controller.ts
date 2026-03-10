import type { InferInsertModel } from "drizzle-orm";
import type { categoriesTable } from "@/db/schema";
import type { GetCategoriesQuery } from "@/modules/categories/category.schema";
import {
  createCategoryService,
  getCategories,
  getCategoryById,
  updateCategoryService,
} from "@/modules/categories/category.service";

export function getCategoriesController(query?: GetCategoriesQuery) {
  return getCategories(query);
}

export function getCategoryByIdController(id: number) {
  return getCategoryById(id);
}

export function createCategoryController(
  values: InferInsertModel<typeof categoriesTable>
) {
  return createCategoryService(values);
}

export function updateCategoryController(
  id: number,
  values: Partial<InferInsertModel<typeof categoriesTable>>
) {
  return updateCategoryService(id, values);
}
