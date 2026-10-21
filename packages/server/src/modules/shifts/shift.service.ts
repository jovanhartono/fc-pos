import dayjs from "dayjs";
import type { shiftsTable } from "@/db/schema";
import { BadRequestException, NotFoundException } from "@/http-exceptions";
import { assertIsAdmin } from "@/modules/permissions/permissions";
import {
  closeOpenShiftsBefore,
  countShifts,
  findLatestShiftByUserId,
  findOpenShiftByUserId,
  findOverlappingShift,
  findShiftById,
  insertShift,
  listShifts,
  updateOpenShiftClockOutByUserId,
  updateShiftTimesById,
} from "@/modules/shifts/shift.repository";
import {
  CLOCK_IN_RADIUS_KM,
  type ClockInCoordinates,
  clockInRequiresLocation,
  type GetShiftsQuery,
  type PatchShiftBody,
  type PostShiftBody,
} from "@/modules/shifts/shift.schema";
import { findStoreById } from "@/modules/stores/store.repository";
import { findUserDetailById } from "@/modules/users/user.repository";
import type { JWTPayload } from "@/types";
import { assertStoreAccess } from "@/utils/authorization";
import { JAKARTA_TZ, jakartaDayStart, jakartaNow } from "@/utils/date";
import { distanceKm } from "@/utils/geo";
import { buildPaginationMeta, normalizePagination } from "@/utils/pagination";
import { isUniqueViolation } from "@/utils/pg-error";

// Location is required, or one tap on Deny skips the check. A worker is turned
// away only when even the near edge of the phone's error circle is outside the
// radius, so a bad indoor fix costs nobody their Shift. Nothing is kept (ADR-0020).
async function assertWithinClockInRadius(
  user: JWTPayload,
  storeId: number,
  coordinates?: ClockInCoordinates
) {
  if (!clockInRequiresLocation(user.role)) {
    return;
  }

  if (!coordinates) {
    throw new BadRequestException("Location is required to clock in");
  }

  const store = await findStoreById(storeId);
  if (!store) {
    throw new NotFoundException("Store does not exist");
  }

  const distance = distanceKm(coordinates, {
    latitude: Number(store.latitude),
    longitude: Number(store.longitude),
  });
  const nearestPossible = distance - coordinates.accuracy_m / 1000;

  if (nearestPossible > CLOCK_IN_RADIUS_KM) {
    throw new BadRequestException(
      `You are ${distance.toFixed(1)} km from ${store.name}. Clock in once you are at the store.`
    );
  }
}

export async function clockIn({
  user,
  storeId,
  coordinates,
}: {
  user: JWTPayload;
  storeId: number;
  coordinates?: ClockInCoordinates;
}) {
  await assertStoreAccess(user, storeId);

  const latest = await findLatestShiftByUserId(user.id);
  const stillOpen = latest !== undefined && latest.clock_out_at === null;
  // The nightly close is best-effort, so yesterday's Forgotten clock-out closes
  // here rather than lock a worker out at 07:00. One opened today still conflicts.
  const [closedNow] = stillOpen
    ? await closeOpenShiftsBefore(todayStart(), user.id)
    : [];
  if (stillOpen && !closedNow) {
    throw new BadRequestException("You already have an open shift");
  }
  const previous = closedNow ?? latest;

  await assertWithinClockInRadius(user, storeId, coordinates);

  try {
    const shift = await insertShift({ user_id: user.id, store_id: storeId });
    // Usually the cron closed it overnight, so this is the worker's only
    // chance to hear their day was cut to ten hours.
    const message = previous?.auto_closed
      ? `Clocked in. ${forgottenClockOutNote(previous)}`
      : "Clocked in";
    return { shift, message };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new BadRequestException("You already have an open shift", {
        cause: error,
      });
    }
    throw error;
  }
}

export async function clockOut(user: JWTPayload) {
  // Tapped the morning after: without this the 08:00 start and today's tap
  // become one 30-hour Shift. See ADR-0025.
  const [forgotten] = await closeOpenShiftsBefore(todayStart(), user.id);
  if (forgotten) {
    return { shift: forgotten, message: forgottenClockOutNote(forgotten) };
  }

  const shift = await updateOpenShiftClockOutByUserId(user.id);
  if (!shift) {
    throw new NotFoundException("No open shift to close");
  }
  return { shift, message: "Clocked out" };
}

// Nobody works past midnight, so every Shift still open now is a Forgotten
// clock-out (ADR-0025).
export async function closeForgottenShifts() {
  const cutoff = todayStart();
  const closed = (await closeOpenShiftsBefore(cutoff)).length;

  return { closed, cutoff };
}

// An admin entering the real hours, usually overtime a worker forgot to clock
// out of. Payroll reads these times, so the Shift records who changed them.
export async function updateShift({
  user,
  shiftId,
  body,
}: {
  user: JWTPayload;
  shiftId: number;
  body: PatchShiftBody;
}) {
  assertIsAdmin(user);

  const shift = await findShiftById(shiftId);
  if (!shift) {
    throw new NotFoundException("Shift does not exist");
  }

  await assertShiftTimesFree({ ...body, userId: shift.user_id, shiftId });

  return updateShiftTimesById(shiftId, { ...body, edited_by: user.id });
}

// Today's work when yesterday's forgotten Shift was the one tapped out, so the
// worker never clocked in today (ADR-0025).
export async function createShift({
  user,
  body,
}: {
  user: JWTPayload;
  body: PostShiftBody;
}) {
  assertIsAdmin(user);

  const [worker, store] = await Promise.all([
    findUserDetailById(body.user_id),
    findStoreById(body.store_id),
  ]);
  if (!(worker?.is_active && worker.role !== "admin")) {
    throw new BadRequestException("Pick an active cashier, worker or courier");
  }
  if (!store?.is_active) {
    throw new BadRequestException("Pick an active store");
  }
  if (!worker.userStores.some(({ store_id }) => store_id === store.id)) {
    throw new BadRequestException(
      `${worker.name} is not assigned to that store`
    );
  }

  await assertShiftTimesFree({ ...body, userId: worker.id });

  return insertShift({ ...body, edited_by: user.id });
}

async function assertShiftTimesFree({
  userId,
  shiftId,
  clock_in_at,
  clock_out_at,
}: {
  userId: number;
  shiftId?: number;
  clock_in_at: Date;
  clock_out_at: Date;
}) {
  if (clock_out_at > new Date()) {
    throw new BadRequestException("Clock out cannot be in the future");
  }

  const overlap = await findOverlappingShift({
    shiftId,
    userId,
    clockIn: clock_in_at,
    clockOut: clock_out_at,
  });
  if (overlap) {
    throw new BadRequestException("These times overlap another shift");
  }
}

function todayStart() {
  return jakartaDayStart(jakartaNow().toDate());
}

function forgottenClockOutNote(
  shift: Pick<typeof shiftsTable.$inferSelect, "clock_in_at" | "clock_out_at">
) {
  const at = (date: Date | null) => dayjs(date).tz(JAKARTA_TZ);
  return `You forgot to clock out on ${at(shift.clock_in_at).format("D MMM")}. Shift closed at ${at(shift.clock_out_at).format("HH:mm")}.`;
}

export function getCurrentShift(user: JWTPayload) {
  return findOpenShiftByUserId(user.id);
}

export async function getShifts(user: JWTPayload, query?: GetShiftsQuery) {
  const effectiveQuery =
    user.role === "admin" ? query : { ...query, user_id: user.id };
  const pagination = normalizePagination(effectiveQuery, { maxPageSize: 100 });

  const [items, total] = await Promise.all([
    listShifts({
      limit: pagination.limit,
      offset: pagination.offset,
      query: effectiveQuery,
    }),
    countShifts(effectiveQuery),
  ]);

  return {
    items,
    meta: buildPaginationMeta(total, pagination),
  };
}
