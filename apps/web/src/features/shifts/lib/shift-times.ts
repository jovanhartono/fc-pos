import type { Shift } from "@/features/shifts/api";
import dayjs, { formatClock } from "@/lib/dayjs";

export const shiftMinutes = (shift: Shift) =>
	dayjs(shift.clock_out_at ?? undefined).diff(shift.clock_in_at, "minute");

export const clockRange = (shift: Shift) =>
	`${formatClock(shift.clock_in_at)} – ${shift.clock_out_at ? formatClock(shift.clock_out_at) : "now"}`;
