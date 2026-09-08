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

export const POSTClockInSchema = z
  .object({
    latitude: z.coerce
      .number()
      .min(-90, "Invalid latitude")
      .max(90, "Invalid latitude")
      .optional(),
    longitude: z.coerce
      .number()
      .min(-180, "Invalid longitude")
      .max(180, "Invalid longitude")
      .optional(),
    store_id: z.coerce.number().int().positive(),
  })
  .refine(
    (value) =>
      (value.latitude === undefined) === (value.longitude === undefined),
    { error: "Latitude and longitude must be sent together" }
  )
  // The wire carries two flat optionals; everything downstream wants one
  // optional pair, so the pairing is resolved here rather than at every hop.
  .transform(({ latitude, longitude, store_id }) => ({
    store_id,
    coordinates:
      latitude === undefined || longitude === undefined
        ? undefined
        : { latitude, longitude },
  }));

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
