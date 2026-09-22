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
    .min(1, "Phone number is required")
    .refine(isValidPhoneNumber, { error: "Invalid phone number" })
    .pipe(
      z.transform((value) => parsePhoneNumberFromString(value)?.number ?? value)
    ),
  address: z.string().trim().min(1, "Address is required"),
  latitude: z.preprocess(
    (val) => (val === "" ? undefined : Number(val)),
    z
      .number("Latitude is required")
      .min(-90, "Invalid latitude")
      .max(90, "Invalid latitude")
      .transform(String)
  ),
  longitude: z.preprocess(
    (val) => (val === "" ? undefined : Number(val)),
    z
      .number("Longitude is required")
      .min(-180, "Invalid longitude")
      .max(180, "Invalid longitude")
      .transform(String)
  ),
  is_active: isActiveSchema,
});

// The generated update schema takes any number for a coordinate. A store's pin
// now decides who may clock in there, so an admin fat-fingering an edit would
// lock that branch's whole team out until someone noticed. Same bounds the
// create form has always had.
export const PUTStoreSchema = createUpdateSchema(storesTable).extend({
  latitude: POSTStoreSchema.shape.latitude.optional(),
  longitude: POSTStoreSchema.shape.longitude.optional(),
});

export const PATCHStoreSchema = createUpdateSchema(storesTable).pick({
  is_active: true,
});
