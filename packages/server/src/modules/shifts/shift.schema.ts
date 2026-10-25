import { z } from "zod";
import {
  fromNotAfterTo,
  fromNotAfterToIssue,
  storeIdQuerySchema,
} from "@/modules/reports/report.schema";
import { dateStringSchema } from "@/schema/common";
import type { JWTPayload } from "@/types";

// Wide on purpose: a worker who lives near their Store is not the problem, and a
// manager quoting it back must be beyond argument (ADR-0020).
export const CLOCK_IN_RADIUS_KM = 3;

// A Courier is on the road all day, never near the Store they clock in at.
// The clock-in screen reads this too.
export const clockInRequiresLocation = (role: JWTPayload["role"]) =>
  role !== "courier";

export const POSTClockInSchema = z.object({
  // One group, so half a location cannot get through. No coercion: `null` and
  // `""` coerce to 0, which would place a worker in the Gulf of Guinea.
  coordinates: z
    .object({
      accuracy_m: z.number().min(0, "Invalid accuracy"),
      latitude: z.number().min(-90, "Invalid latitude").max(90),
      longitude: z.number().min(-180, "Invalid longitude").max(180),
    })
    .optional(),
  store_id: z.coerce.number().int().positive(),
});

export type ClockInCoordinates = NonNullable<
  z.infer<typeof POSTClockInSchema>["coordinates"]
>;

// The shop's normal day. An Auto-closed Shift is closed this long after
// clock-in, so it pays no overtime until an admin enters the real time.
export const FORGOTTEN_SHIFT_HOURS = 10;

// Longer than this is a typo, not a day's work.
const MAX_SHIFT_HOURS = 24;

// Strict ISO strings, no coercion: `null` coerces to 1970 and would pass.
const shiftTime = z.iso.datetime().transform((value) => new Date(value));

const shiftTimes = { clock_in_at: shiftTime, clock_out_at: shiftTime };

function checkShiftTimes(
  body: { clock_in_at: Date; clock_out_at?: Date },
  ctx: z.RefinementCtx
) {
  if (!body.clock_out_at) {
    return;
  }
  const hours =
    (body.clock_out_at.getTime() - body.clock_in_at.getTime()) / 3_600_000;
  if (hours <= 0) {
    ctx.addIssue({
      code: "custom",
      message: "Clock out must be after clock in",
      path: ["clock_out_at"],
    });
  } else if (hours > MAX_SHIFT_HOURS) {
    ctx.addIssue({
      code: "custom",
      message: `A shift cannot be longer than ${MAX_SHIFT_HOURS} hours`,
      path: ["clock_out_at"],
    });
  }
}

export const PATCHShiftSchema = z
  .object({
    clock_in_at: shiftTime,
    clock_out_at: shiftTime.optional(),
    // Optional: a page still on the old build sends only the times.
    store_id: z.number().int().positive().optional(),
  })
  .superRefine(checkShiftTimes);

export type PatchShiftBody = z.infer<typeof PATCHShiftSchema>;

// An admin recording a day the worker never clocked in for.
export const POSTShiftSchema = z
  .object({
    ...shiftTimes,
    store_id: z.number().int().positive(),
    user_id: z.number().int().positive(),
  })
  .superRefine(checkShiftTimes);

export type PostShiftBody = z.infer<typeof POSTShiftSchema>;

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

export const GETShiftsOverviewQuerySchema = z
  .object({
    from: dateStringSchema("from"),
    store_id: storeIdQuerySchema.optional(),
    to: dateStringSchema("to"),
  })
  .refine(fromNotAfterTo, fromNotAfterToIssue);

export type GetShiftsOverviewQuery = z.infer<
  typeof GETShiftsOverviewQuerySchema
>;
