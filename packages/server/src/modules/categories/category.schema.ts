import { createUpdateSchema } from "drizzle-orm/zod";
import { z } from "zod";
import { categoriesTable } from "@/db/schema";
import { isActiveSchema, textSchema, varcharSchema } from "@/schema/common";

export const POSTCategorySchema = z.object({
  name: varcharSchema("name"),
  description: textSchema("Description").nullish(),
  is_active: isActiveSchema,
  starts_after_cleaning: z.boolean().optional().default(false),
});
export const PUTCategorySchema = createUpdateSchema(categoriesTable);

export const GETCategoriesQuerySchema = z
  .object({
    is_active: z.stringbool().optional(),
  })
  .optional();

export type GetCategoriesQuery = z.infer<typeof GETCategoriesQuerySchema>;
