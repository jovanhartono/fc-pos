import { BadRequestException, NotFoundException } from "@/errors";
import {
  countShifts,
  findOpenShiftByUserId,
  insertShift,
  listShifts,
  updateShiftClockOutById,
} from "@/modules/shifts/shift.repository";
import type { GetShiftsQuery } from "@/modules/shifts/shift.schema";
import type { JWTPayload } from "@/types";
import { assertStoreAccess } from "@/utils/authorization";
import { isUniqueViolation } from "@/utils/errors";
import { buildPaginationMeta, normalizePagination } from "@/utils/pagination";

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
    if (isUniqueViolation(error)) {
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
