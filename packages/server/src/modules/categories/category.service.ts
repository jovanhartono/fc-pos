import type { InferInsertModel } from "drizzle-orm";

import type { categoriesTable } from "@/db/schema";
import {
  findCategoryById,
  insertCategory,
  listCategories,
  updateCategoryById,
} from "@/modules/categories/category.repository";
import type { GetCategoriesQuery } from "@/modules/categories/category.schema";

export const getCategories = (query?: GetCategoriesQuery) =>
  listCategories({ is_active: query?.is_active });

export const getCategoryById = (id: number) => findCategoryById(id);

export const createCategory = async (
  values: InferInsertModel<typeof categoriesTable>
) => {
  const [category] = await insertCategory(values);
  return category;
};

export const updateCategory = async (
  id: number,
  values: Partial<InferInsertModel<typeof categoriesTable>>
) => {
  const [category] = await updateCategoryById(id, values);
  return category ?? null;
};
