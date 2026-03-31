import { createInsertSchema, createUpdateSchema } from "drizzle-orm/zod";
import { productsTable } from "@/db/schema";

export const POSTProductSchema = createInsertSchema(productsTable);
export const PUTProductSchema = createUpdateSchema(productsTable);
