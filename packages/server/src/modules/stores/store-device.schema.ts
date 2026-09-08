import { z } from "zod";
import { optionalVarcharSchema } from "@/schema/common";
import { idNumberSchema } from "@/schema/param";

// The name is kept exactly as the printer announces itself, spaces and all.
// Printing looks for that name letter for letter, so tidying it up here would
// leave a device on the list that the POS can never find again. The label is
// typed by the cashier, so that one is tidied.
export const POSTStoreDeviceSchema = z.object({
  name: z
    .string({ error: "Device name is required" })
    .max(64, "Device name must be at most 64 characters")
    .refine((name) => name.trim().length > 0, "Device name cannot be empty"),
  label: optionalVarcharSchema("Label", 64),
});

export const deviceIdParamSchema = z.object({
  id: idNumberSchema,
  deviceId: idNumberSchema,
});
