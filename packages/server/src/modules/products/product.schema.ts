import { createUpdateSchema } from "drizzle-orm/zod";
import { z } from "zod";
import { productsTable } from "@/db/schema";
import {
  currencySchema,
  isActiveSchema,
  textSchema,
  varcharSchema,
} from "@/schema/common";

export const POSTProductSchema = z.object({
  name: varcharSchema("Name"),
  description: textSchema("Description").nullish(),
  is_active: isActiveSchema,
  sku: z
    .string({
      error: (issue) =>
        issue.input === undefined ? "SKU is required" : "SKU must be a string",
    })
    .min(1, "SKU is required")
    .regex(
      /^[A-Z0-9]+$/,
      "SKU must contain only uppercase letters and numbers"
    ),
  uom: varcharSchema("UOM"),
  stock: z.int("Stock is required"),

  category_id: z
    .int({
      error: (issue) =>
        issue.input === undefined
          ? "Category is required"
          : "Category must be a number",
    })
    .positive("Category must be a valid category ID"),

  cogs: currencySchema("COGS"),
  price: currencySchema("Price"),
});
// Editing a price is the same money boundary as creating one, so it gets the
// same guard — otherwise "1.500" reaches the column as one and a half rupiah.
export const PUTProductSchema = createUpdateSchema(productsTable).extend({
  cogs: currencySchema("COGS").optional(),
  price: currencySchema("Price").optional(),
});
