import { createUpdateSchema } from "drizzle-orm/zod";
import {
  isValidPhoneNumber,
  parsePhoneNumberFromString,
} from "libphonenumber-js";
import { z } from "zod";
import { storesTable } from "@/db/schema";
import { isActiveSchema, textSchema, varcharSchema } from "@/schema/common";

// The pairing chooser filters on the exact advertised string, so a blank means
// "no printer remembered" — never "", which would match no device and lock the
// counter out of pairing. textSchema already turns blank into null.
const printerNameSchema = textSchema("Printer name", 64).nullish();

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
  printer_name: printerNameSchema,
});

export const PUTStoreSchema = createUpdateSchema(storesTable, {
  printer_name: printerNameSchema,
});

// Written by the POS that just paired, so the name is whatever the printer
// advertised — required here because "remember nothing" is not a pairing.
export const PUTStorePrinterSchema = z.object({
  printer_name: varcharSchema("Printer name", 64),
});

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
