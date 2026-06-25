import { createUpdateSchema } from "drizzle-orm/zod";
import {
  isValidPhoneNumber,
  parsePhoneNumberFromString,
} from "libphonenumber-js";
import { z } from "zod";
import { storesTable } from "@/db/schema";
import { isActiveSchema } from "@/schema/common";

export const POSTStoreSchema = z.object({
  code: z.string().trim().min(3, "Minimum 3 characters").max(3),
  name: z.string().trim().min(1, "Store name is required"),
  phone_number: z
    .string()
    .trim()
    .min(1, "Phone number is required!")
    .refine(isValidPhoneNumber, { error: "Invalid phone number" })
    .pipe(
      z.transform((value) => parsePhoneNumberFromString(value)?.number ?? value)
    ),
  address: z.string().trim().min(1, "Address is required!"),
  latitude: z.preprocess(
    (val) => (val === "" ? undefined : Number(val)),
    z
      .number("Latitude is required!")
      .min(-90, "Invalid latitude")
      .max(90, "Invalid latitude")
      .transform(String)
  ),
  longitude: z.preprocess(
    (val) => (val === "" ? undefined : Number(val)),
    z
      .number("Longitude is required!")
      .min(-180, "Invalid longitude")
      .max(180, "Invalid longitude")
      .transform(String)
  ),
  is_active: isActiveSchema,
});
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
