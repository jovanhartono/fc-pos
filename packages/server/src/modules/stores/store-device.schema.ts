import { z } from "zod";
import { optionalVarcharSchema, varcharSchema } from "@/schema/common";

export const POSTStoreDeviceSchema = z.object({
  name: varcharSchema("Device name", 64),
  label: optionalVarcharSchema("Label", 64),
});

export const deviceIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
  deviceId: z.coerce.number().int().positive(),
});
