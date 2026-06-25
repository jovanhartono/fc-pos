import { createUpdateSchema } from "drizzle-orm/zod";
import { z } from "zod";
import { paymentMethodsTable } from "@/db/schema";
import { isActiveSchema, varcharSchema } from "@/schema/common";

export const POSTPaymentMethodSchema = z.object({
  name: varcharSchema("Payment Method"),
  code: varcharSchema("Code"),
  is_active: isActiveSchema,
});
export const PUTPaymentMethodSchema = createUpdateSchema(paymentMethodsTable);

export const GETPaymentMethodsQuerySchema = z
  .object({
    is_active: z.stringbool().optional(),
  })
  .optional();

export type GetPaymentMethodsQuery = z.infer<
  typeof GETPaymentMethodsQuerySchema
>;
