import { createInsertSchema, createUpdateSchema } from "drizzle-orm/zod";
import { servicesTable } from "@/db/schema";

export const POSTServiceSchema = createInsertSchema(servicesTable);
export const PUTServiceSchema = createUpdateSchema(servicesTable);
