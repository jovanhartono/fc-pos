import { createInsertSchema, createUpdateSchema } from "drizzle-zod";
import { servicesTable } from "@/db/schema";

export const POSTServiceSchema = createInsertSchema(servicesTable);
export const PUTServiceSchema = createUpdateSchema(servicesTable);
