import { z } from "zod";
import { optionalVarcharSchema } from "@/schema/common";
import { idNumberSchema } from "@/schema/param";

// The name stays exactly as the printer announces itself: the POS finds the
// printer letter for letter, so a trimmed name could never print.
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
