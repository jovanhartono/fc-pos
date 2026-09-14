import { z } from "zod";
import { dateStringSchema } from "@/schema/common";
import type { JWTPayload } from "@/types";

// Past this, the clock-in reads as out-of-range on the Shifts page. It never
// refuses the Shift — a phone indoors can be a kilometre wrong about a worker
// standing at the counter. See ADR-0020.
export const CLOCK_IN_RADIUS_KM = 1;

// A Courier collects and delivers between Stores all day, so their phone is
// never near the branch they clock against. Asking would flag them every
// morning and teach everyone to ignore the flag. Both the server and the
// clock-in screen read this, so it is stated once.
export const clockInRequiresLocation = (role: JWTPayload["role"]) =>
  role !== "courier";

export const POSTClockInSchema = z.object({
  // One optional pair, so a body that shares half a location cannot get through.
  // Numbers only, no coercion: `null` and `""` coerce to 0, which would file a
  // shift at the Gulf of Guinea while looking like no location was shared.
  coordinates: z
    .object({
      latitude: z.number().min(-90, "Invalid latitude").max(90),
      longitude: z.number().min(-180, "Invalid longitude").max(180),
    })
    .optional(),
  store_id: z.coerce.number().int().positive(),
});

export const GETShiftsQuerySchema = z
  .object({
    from: dateStringSchema("from").optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    offset: z.coerce.number().int().min(0).optional(),
    store_id: z.coerce.number().int().positive().optional(),
    to: dateStringSchema("to").optional(),
    user_id: z.coerce.number().int().positive().optional(),
  })
  .optional();

export type GetShiftsQuery = z.infer<typeof GETShiftsQuerySchema>;
