import { BadRequestException, NotFoundException } from "@/http-exceptions";
import {
  closeOpenShiftsBefore,
  countShifts,
  findOpenShiftByUserId,
  type InsertShiftValues,
  insertShift,
  listShifts,
  updateShiftClockOutById,
} from "@/modules/shifts/shift.repository";
import {
  clockInRequiresLocation,
  type GetShiftsQuery,
} from "@/modules/shifts/shift.schema";
import { findStoreById } from "@/modules/stores/store.repository";
import type { JWTPayload } from "@/types";
import { assertStoreAccess } from "@/utils/authorization";
import { jakartaDayStart, jakartaNow } from "@/utils/date";
import { type Coordinates, distanceKm } from "@/utils/geo";
import { buildPaginationMeta, normalizePagination } from "@/utils/pagination";
import { isUniqueViolation } from "@/utils/pg-error";

type ShiftLocation = Pick<
  InsertShiftValues,
  "clock_in_distance_km" | "clock_in_latitude" | "clock_in_longitude"
>;

// Sharing a location is mandatory for everyone the rule covers: refusing is a
// choice, and the whole record would be opt-out by one tap on Deny. The
// distance it produces never refuses the Shift. See ADR-0020.
async function resolveClockInLocation(
  user: JWTPayload,
  storeId: number,
  coordinates?: Coordinates
): Promise<ShiftLocation> {
  if (!clockInRequiresLocation(user.role)) {
    return {};
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

  return {
    clock_in_distance_km: distance.toFixed(3),
    clock_in_latitude: coordinates.latitude.toFixed(8),
    clock_in_longitude: coordinates.longitude.toFixed(8),
  };
}

export async function clockIn({
  user,
  storeId,
  coordinates,
}: {
  user: JWTPayload;
  storeId: number;
  coordinates?: Coordinates;
}) {
  await assertStoreAccess(user, storeId);

  const existing = await findOpenShiftByUserId(user.id);
  if (existing) {
    throw new BadRequestException("You already have an open shift");
  }

  const location = await resolveClockInLocation(user, storeId, coordinates);

  try {
    return await insertShift({
      user_id: user.id,
      store_id: storeId,
      ...location,
    });
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
  const open = await findOpenShiftByUserId(user.id);
  if (!open) {
    throw new NotFoundException("No open shift to close");
  }

  return updateShiftClockOutById(open.id);
}

// Runs just after midnight Jakarta. Only Shifts opened before today close, so a
// worker who started at 00:02 on an early delivery keeps theirs.
export async function closeForgottenShifts() {
  const cutoff = jakartaDayStart(jakartaNow().toDate());
  const closed = await closeOpenShiftsBefore(cutoff);

  return { closed, cutoff };
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
