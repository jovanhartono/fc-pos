import type { Shift } from "@/features/shifts/api";
import dayjs, { formatClock, formatDay } from "@/lib/dayjs";

export const shiftMinutes = (shift: Shift) =>
	dayjs(shift.clock_out_at ?? undefined).diff(shift.clock_in_at, "minute");

export const clockRange = (
	shift: Pick<Shift, "clock_in_at" | "clock_out_at">,
) =>
	`${formatClock(shift.clock_in_at)} – ${shift.clock_out_at ? formatClock(shift.clock_out_at) : "now"}`;

export const shiftSummary = (shift: Shift) =>
	`${shift.user?.name ?? `User #${shift.user_id}`} · ${formatDay(shift.clock_in_at)} ·${clockRange(shift)}`;
