import { z } from "zod";
import { phoneSchema, textSchema, varcharSchema } from "@/schema/common";

export const GETCustomersQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).optional(),
    offset: z.coerce.number().int().min(0).optional(),
    search: z.string().optional(),
  })
  .optional();

export type GetCustomersQuery = z.infer<typeof GETCustomersQuerySchema>;

const customerSchema = z.object({
  name: varcharSchema("Name"),
  phone_number: phoneSchema,
  email: z.email("Invalid email address").nullish(),
  address: textSchema("Address").nullish(),
  origin_store_id: z.int({
    error: (issue) =>
      issue.input === undefined
        ? "Origin store is required"
        : "Origin store must be a number",
  }),
});

export const POSTCustomerSchema = customerSchema;
export const PUTCustomerSchema = customerSchema.omit({
  origin_store_id: true,
});
