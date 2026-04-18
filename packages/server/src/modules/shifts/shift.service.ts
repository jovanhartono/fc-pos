import { BadRequestException, NotFoundException } from "@/errors";
import {
  findOpenShiftByUserId,
  insertShift,
  listShifts,
  updateShiftClockOutById,
} from "@/modules/shifts/shift.repository";
import type { GetShiftsQuery } from "@/modules/shifts/shift.schema";
import type { JWTPayload } from "@/types";
import { assertStoreAccess } from "@/utils/authorization";

export async function clockIn({
  user,
  storeId,
}: {
  user: JWTPayload;
  storeId: number;
}) {
  await assertStoreAccess(user, storeId);

  const existing = await findOpenShiftByUserId(user.id);
  if (existing) {
    throw new BadRequestException("You already have an open shift");
  }

  try {
    return await insertShift({ user_id: user.id, store_id: storeId });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "cause" in error &&
      typeof error.cause === "object" &&
      error.cause !== null &&
      "code" in error.cause &&
      error.cause.code === "23505"
    ) {
      throw new BadRequestException("You already have an open shift");
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

export function getCurrentShift(user: JWTPayload) {
  return findOpenShiftByUserId(user.id);
}

export function getShifts(user: JWTPayload, query?: GetShiftsQuery) {
  if (user.role !== "admin") {
    return listShifts({ ...query, user_id: user.id });
  }
  return listShifts(query);
}
