import dayjs from "dayjs";

import type { shiftsTable } from "@/db/schema";
import { BadRequestException, NotFoundException } from "@/http-exceptions";
import { assertIsAdmin } from "@/modules/permissions/permissions";
import {
  closeOpenShiftsBefore,
  countShifts,
  deleteShiftById,
  findLatestShiftByUserId,
  findOpenShiftByUserId,
  findOverlappingShift,
  findShiftById,
  insertShift,
  listShiftDays,
  listShifts,
  updateOpenShiftClockOutByUserId,
  updateShiftById,
} from "@/modules/shifts/shift.repository";
import type {
  ClockInCoordinates,
  GetShiftsOverviewQuery,
  GetShiftsQuery,
  PatchShiftBody,
  PostShiftBody,
} from "@/modules/shifts/shift.schema";
import { findStoreById } from "@/modules/stores/store.repository";
import { findUserDetailById } from "@/modules/users/user.repository";
import { CLOCK_IN_RADIUS_KM, clockInRequiresLocation } from "@/schema/clock-in";
import type { AuthUser, JWTPayload } from "@/types";
import { assertStoreAccess } from "@/utils/authorization";
import { JAKARTA_TZ, jakartaDayStart, jakartaNow } from "@/utils/date";
import { distanceKm } from "@/utils/geo";
import { buildPaginationMeta, normalizePagination } from "@/utils/pagination";
import { isUniqueViolation } from "@/utils/pg-error";

const todayStart = () => jakartaDayStart(jakartaNow().toDate());

const atJakarta = (date: Date | null) => dayjs(date).tz(JAKARTA_TZ);

const forgottenClockOutNote = (
  shift: Pick<typeof shiftsTable.$inferSelect, "clock_in_at" | "clock_out_at">
) =>
  `You forgot to clock out on ${atJakarta(shift.clock_in_at).format("D MMM")}. Shift closed at ${atJakarta(shift.clock_out_at).format("HH:mm")}.`;

const assertStoreForWorker = (
  worker: Awaited<ReturnType<typeof findUserDetailById>>,
  store: Awaited<ReturnType<typeof findStoreById>>
) => {
  if (!worker) {
    throw new NotFoundException("User does not exist");
  }
  if (!store?.is_active) {
    throw new BadRequestException("Pick an active store");
  }
  if (!worker.userStores.some(({ store_id }) => store_id === store.id)) {
    throw new BadRequestException(
      `${worker.name} is not assigned to that store`
    );
  }
};

const assertShiftTimesFree = async ({
  userId,
  shiftId,
  clock_in_at,
  clock_out_at,
}: {
  userId: number;
  shiftId?: number;
  clock_in_at: Date;
  clock_out_at?: Date;
}) => {
  if (clock_out_at && clock_out_at > new Date()) {
    throw new BadRequestException("Clock out cannot be in the future");
  }
  if (clock_in_at > new Date()) {
    throw new BadRequestException("Clock in cannot be in the future");
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
};

// Location is required, or one tap on Deny skips the check. A worker is turned
// away only when even the near edge of the phone's error circle is outside the
// radius, so a bad indoor fix costs nobody their Shift. Nothing is kept (ADR-0020).
const assertWithinClockInRadius = async (
  user: JWTPayload,
  storeId: number,
  coordinates?: ClockInCoordinates
) => {
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
};

export const clockIn = async ({
  user,
  storeId,
  coordinates,
}: {
  user: AuthUser;
  storeId: number;
  coordinates?: ClockInCoordinates;
}) => {
  await assertStoreAccess(user, storeId);

  const latest = await findLatestShiftByUserId(user.id);
  const stillOpen = latest !== undefined && latest.clock_out_at === null;
  // The nightly close is best-effort, so yesterday's open Shift auto-closes
  // here rather than lock a worker out at 07:00. One opened today still conflicts.
  const [closedNow] = stillOpen
    ? await closeOpenShiftsBefore(todayStart(), user.id)
    : [];
  if (stillOpen && !closedNow) {
    throw new BadRequestException("You're already On shift");
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
      throw new BadRequestException("You're already On shift", {
        cause: error,
      });
    }
    throw error;
  }
};

export const clockOut = async (user: JWTPayload) => {
  // Tapped the morning after: without this the 08:00 start and today's tap
  // become one 30-hour Shift. See ADR-0025.
  const [forgotten] = await closeOpenShiftsBefore(todayStart(), user.id);
  if (forgotten) {
    return { shift: forgotten, message: forgottenClockOutNote(forgotten) };
  }

  const shift = await updateOpenShiftClockOutByUserId(user.id);
  if (!shift) {
    throw new NotFoundException("You're not On shift");
  }
  return { shift, message: "Clocked out" };
};

// Nobody works past midnight, so every Shift still open now is auto-closed
// (ADR-0025).
export const closeForgottenShifts = async () => {
  const cutoff = todayStart();
  const closedShifts = await closeOpenShiftsBefore(cutoff);
  const closed = closedShifts.length;

  return { closed, cutoff };
};

// An admin entering the real hours, usually overtime a worker forgot to clock
// out of. Payroll reads these times, so the Shift records who changed them.
export const updateShift = async ({
  user,
  shiftId,
  body,
}: {
  user: JWTPayload;
  shiftId: number;
  body: PatchShiftBody;
}) => {
  assertIsAdmin(user);

  const shift = await findShiftById(shiftId);
  if (!shift) {
    throw new NotFoundException("Shift does not exist");
  }

  // An earlier start would leave a running Shift for the midnight close to cut.
  if (!body.clock_out_at && body.clock_in_at < todayStart()) {
    throw new BadRequestException(
      "This Shift started before today. Enter the clock-out time."
    );
  }

  if (body.store_id !== shift.store_id) {
    const [worker, store] = await Promise.all([
      findUserDetailById(shift.user_id),
      findStoreById(body.store_id),
    ]);
    assertStoreForWorker(worker, store);
  }

  await assertShiftTimesFree({ ...body, userId: shift.user_id, shiftId });

  const updated = await updateShiftById(shiftId, {
    ...body,
    clock_out_at: body.clock_out_at ?? null,
    edited_by: user.id,
  });
  // Reopening a finished Shift was ruled out: delete it and clock in again.
  if (!updated) {
    throw new BadRequestException("This shift has ended. Enter the clock out.");
  }
  return updated;
};

// A mistaken clock-in or a duplicate, kept out of payroll.
export const deleteShift = async ({
  user,
  shiftId,
}: {
  user: JWTPayload;
  shiftId: number;
}) => {
  assertIsAdmin(user);

  const deleted = await deleteShiftById(shiftId);
  if (!deleted) {
    throw new NotFoundException("Shift does not exist");
  }
  return deleted;
};

// Today's work when yesterday's Auto-closed Shift was the one tapped out, so the
// worker never clocked in today (ADR-0025).
export const createShift = async ({
  user,
  body,
}: {
  user: JWTPayload;
  body: PostShiftBody;
}) => {
  assertIsAdmin(user);

  const [worker, store] = await Promise.all([
    findUserDetailById(body.user_id),
    findStoreById(body.store_id),
  ]);
  if (!(worker?.is_active && worker.role !== "admin")) {
    throw new BadRequestException("Pick an active cashier, worker or courier");
  }
  assertStoreForWorker(worker, store);

  await assertShiftTimesFree({ ...body, userId: worker.id });

  return insertShift({ ...body, edited_by: user.id });
};

export const getCurrentShift = (user: JWTPayload) =>
  findOpenShiftByUserId(user.id);

export const getShiftsOverview = async (
  user: JWTPayload,
  query: GetShiftsOverviewQuery
) => {
  assertIsAdmin(user);

  const { from, to, store_id: storeId } = query;
  // Days at every Store, not just the one picked: the meal fee goes by all of them.
  const rows = await listShiftDays({ from, to, storeId });
  const people = new Map(
    rows.map(({ user_id, name, role }) => [
      user_id,
      { id: user_id, name, role },
    ])
  );

  return {
    people: [...people.values()].toSorted((a, b) =>
      a.name.localeCompare(b.name)
    ),
    days: rows.map(({ name: _name, role: _role, ...day }) => day),
  };
};

export const getShifts = async (user: JWTPayload, query?: GetShiftsQuery) => {
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
};
