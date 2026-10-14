import { z } from "zod";
import { dateStringSchema } from "@/schema/common";
import type { JWTPayload } from "@/types";

// Outside this, the clock-in is refused. Wide on purpose: a worker who lives
// near their branch is not the problem, and the number has to be one nobody can
// argue with when a manager quotes it back to them. See ADR-0020.
export const CLOCK_IN_RADIUS_KM = 3;

// A Courier collects and delivers between Stores all day, so their phone is
// never near the branch they clock against. Asking would flag them every
// morning and teach everyone to ignore the flag. Both the server and the
// clock-in screen read this, so it is stated once.
export const clockInRequiresLocation = (role: JWTPayload["role"]) =>
  role !== "courier";

export const POSTClockInSchema = z.object({
  // One optional group, so a body that shares half a location cannot get through.
  // Numbers only, no coercion: `null` and `""` coerce to 0, which would place a
  // worker at the Gulf of Guinea while looking like no location was shared.
  // `accuracy_m` is how wide the phone says its own guess is, and a worker is
  // given the benefit of it.
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

// The shop's normal day. A Forgotten clock-out is closed this long after
// clock-in, so it pays no overtime until an admin enters the real time.
export const FORGOTTEN_SHIFT_HOURS = 10;

// Longer than this is a typo, not a day's work.
const MAX_SHIFT_HOURS = 24;

// Strict ISO strings, no coercion: `null` coerces to 1970 and would pass.
const shiftTime = z.iso.datetime().transform((value) => new Date(value));

const shiftTimes = { clock_in_at: shiftTime, clock_out_at: shiftTime };

function checkShiftTimes(
  body: { clock_in_at: Date; clock_out_at: Date },
  ctx: z.RefinementCtx
) {
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
  .object(shiftTimes)
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
