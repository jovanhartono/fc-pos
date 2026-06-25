import { createUpdateSchema } from "drizzle-orm/zod";
import { z } from "zod";
import { servicesTable } from "@/db/schema";
import {
  currencySchema,
  isActiveSchema,
  textSchema,
  varcharSchema,
} from "@/schema/common";

export const POSTServiceSchema = z.object({
  category_id: z
    .int({
      error: (issue) =>
        issue.input === undefined
          ? "Category is required"
          : "Category must be a number",
    })
    .positive("Category must be a valid category ID"),

  code: z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? "Code is required"
          : "Code must be a string",
    })
    .min(1, "Code is required")
    .max(4, "Code must be at most 4 characters")
    .regex(
      /^[A-Z0-9]+$/,
      "Code must contain only uppercase letters and numbers"
    ),

  cogs: currencySchema("COGS"),
  price: currencySchema("Price"),

  name: varcharSchema("Name"),
  description: textSchema("Description").nullish(),
  is_active: isActiveSchema,
  is_priority: z.boolean().default(false),
});
export const PUTServiceSchema = createUpdateSchema(servicesTable);
