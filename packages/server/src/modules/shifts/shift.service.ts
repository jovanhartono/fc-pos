import { BadRequestException, NotFoundException } from "@/http-exceptions";
import {
  closeOpenShiftsBefore,
  countShifts,
  findOpenShiftByUserId,
  insertShift,
  listShifts,
  updateShiftClockOutById,
} from "@/modules/shifts/shift.repository";
import {
  CLOCK_IN_RADIUS_KM,
  type ClockInCoordinates,
  clockInRequiresLocation,
  type GetShiftsQuery,
} from "@/modules/shifts/shift.schema";
import { findStoreById } from "@/modules/stores/store.repository";
import type { JWTPayload } from "@/types";
import { assertStoreAccess } from "@/utils/authorization";
import { jakartaDayStart, jakartaNow } from "@/utils/date";
import { distanceKm } from "@/utils/geo";
import { buildPaginationMeta, normalizePagination } from "@/utils/pagination";
import { isUniqueViolation } from "@/utils/pg-error";

// Sharing a location is mandatory for everyone the rule covers: refusing is a
// choice, and the gate would be opt-out by one tap on Deny.
//
// A phone reports a circle, not a point, and `accuracy_m` is that circle's
// radius. A worker is only turned away when even the near edge of the circle is
// outside the ring, so a bad indoor fix costs nobody their shift, while someone
// at home with working GPS has no circle wide enough to reach the branch.
// Nothing is kept afterwards: the Shift exists, so it passed. See ADR-0020.
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

  const existing = await findOpenShiftByUserId(user.id);
  if (existing) {
    // Yesterday's forgotten clock-out must not cost a worker their morning: the
    // nightly sweep is best-effort and behind a shared secret, so waiting on it
    // is what locks someone out at 07:00. A shift opened today still conflicts.
    const healed = await closeOpenShiftsBefore(
      jakartaDayStart(jakartaNow().toDate()),
      user.id
    );
    if (healed === 0) {
      throw new BadRequestException("You already have an open shift");
    }
  }

  await assertWithinClockInRadius(user, storeId, coordinates);

  try {
    return await insertShift({ user_id: user.id, store_id: storeId });
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

// Reaches back a full day, because someone who clocked in at 22:30 for a late
// close is still on the floor when this fires at midnight; their row closes
// tomorrow night, or when they next clock in.
export async function closeForgottenShifts() {
  const cutoff = jakartaDayStart(jakartaNow().subtract(1, "day").toDate());
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
