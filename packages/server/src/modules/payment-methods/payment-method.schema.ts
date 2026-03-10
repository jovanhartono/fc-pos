import { createInsertSchema, createUpdateSchema } from "drizzle-zod";
import { z } from "zod";
import { paymentMethodsTable } from "@/db/schema";

export const POSTPaymentMethodSchema = createInsertSchema(paymentMethodsTable);
export const PUTPaymentMethodSchema = createUpdateSchema(paymentMethodsTable);

export const GETPaymentMethodsQuerySchema = z
  .object({
    is_active: z.coerce.boolean().optional(),
  })
  .optional();

export type GetPaymentMethodsQuery = z.infer<
  typeof GETPaymentMethodsQuerySchema
>;
