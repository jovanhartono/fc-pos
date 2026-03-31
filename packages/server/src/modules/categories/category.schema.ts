import { createInsertSchema, createUpdateSchema } from "drizzle-orm/zod";
import { z } from "zod";
import { categoriesTable } from "@/db/schema";

export const POSTCategorySchema = createInsertSchema(categoriesTable);
export const PUTCategorySchema = createUpdateSchema(categoriesTable);

export const GETCategoriesQuerySchema = z
  .object({
    is_active: z.coerce.boolean().optional(),
  })
  .optional();

export type GetCategoriesQuery = z.infer<typeof GETCategoriesQuerySchema>;
