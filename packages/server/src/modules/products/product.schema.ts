import { createInsertSchema, createUpdateSchema } from "drizzle-zod";
import { productsTable } from "@/db/schema";

export const POSTProductSchema = createInsertSchema(productsTable);
export const PUTProductSchema = createUpdateSchema(productsTable);
