import { createInsertSchema, createUpdateSchema } from "drizzle-zod";
import { z } from "zod";
import { orderServicesImagesTable } from "@/db/schema";

export const POSTOrderServiceImageSchema = createInsertSchema(
  orderServicesImagesTable
);
export const PUTOrderServiceImageSchema = createUpdateSchema(
  orderServicesImagesTable
);

export const GETOrderServiceImagesQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).optional(),
    offset: z.coerce.number().int().min(0).optional(),
    order_service_id: z.coerce.number().int().positive().optional(),
  })
  .optional();

export type GetOrderServiceImagesQuery = z.infer<
  typeof GETOrderServiceImagesQuerySchema
>;
