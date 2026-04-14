import { createInsertSchema, createUpdateSchema } from "drizzle-orm/zod";
import { z } from "zod";
import { storesTable } from "@/db/schema";

export const POSTStoreSchema = createInsertSchema(storesTable);
export const PUTStoreSchema = createUpdateSchema(storesTable);
export const PATCHStoreSchema = createUpdateSchema(storesTable).pick({
  is_active: true,
});

export const GETNearestStoreQuerySchema = z.object({
  latitude: z.coerce
    .number()
    .min(-90, "Invalid latitude")
    .max(90, "Invalid latitude"),
  longitude: z.coerce
    .number()
    .min(-180, "Invalid longitude")
    .max(180, "Invalid longitude"),
  limit: z.coerce.number().int().min(1).max(20).default(1).optional(),
  radius_km: z.coerce.number().positive().max(20_000).optional(),
  include_inactive: z.stringbool().default(false).optional(),
});

export type GetNearestStoreQuery = z.infer<typeof GETNearestStoreQuerySchema>;
