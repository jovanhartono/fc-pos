import { z } from "zod";
import { dateStringSchema } from "@/schema/common";

export const POSTClockInSchema = z.object({
  store_id: z.coerce.number().int().positive(),
});

export const GETShiftsQuerySchema = z
  .object({
    from: dateStringSchema("from").optional(),
    store_id: z.coerce.number().int().positive().optional(),
    to: dateStringSchema("to").optional(),
    user_id: z.coerce.number().int().positive().optional(),
  })
  .optional();

export type ClockInInput = z.infer<typeof POSTClockInSchema>;
export type GetShiftsQuery = z.infer<typeof GETShiftsQuerySchema>;
