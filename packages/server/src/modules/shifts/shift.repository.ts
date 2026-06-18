import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { shiftsTable } from "@/db/schema";
import type { GetShiftsQuery } from "@/modules/shifts/shift.schema";
import { jakartaDayEnd, jakartaDayStart } from "@/utils/date";

export function insertShift(values: { user_id: number; store_id: number }) {
  return db
    .insert(shiftsTable)
    .values({
      user_id: values.user_id,
      store_id: values.store_id,
    })
    .returning()
    .then((rows) => rows[0]);
}

export function findOpenShiftByUserId(userId: number) {
  return db.query.shiftsTable.findFirst({
    where: {
      user_id: userId,
      clock_out_at: { isNull: true },
    },
    with: {
      store: {
        columns: { id: true, code: true, name: true },
      },
    },
  });
}

export function updateShiftClockOutById(shiftId: number) {
  return db
    .update(shiftsTable)
    .set({ clock_out_at: new Date() })
    .where(eq(shiftsTable.id, shiftId))
    .returning()
    .then((rows) => rows[0] ?? null);
}

function buildCountWhere(query?: GetShiftsQuery) {
  const conditions = [
    query?.user_id === undefined
      ? undefined
      : eq(shiftsTable.user_id, query.user_id),
    query?.store_id === undefined
      ? undefined
      : eq(shiftsTable.store_id, query.store_id),
    query?.from
      ? gte(shiftsTable.clock_in_at, jakartaDayStart(query.from))
      : undefined,
    query?.to
      ? lte(shiftsTable.clock_in_at, jakartaDayEnd(query.to))
      : undefined,
  ].filter((condition) => condition !== undefined);

  return conditions.length > 0 ? and(...conditions) : undefined;
}

export function listShifts({
  limit,
  offset,
  query,
}: {
  limit: number;
  offset: number;
  query?: GetShiftsQuery;
}) {
  return db.query.shiftsTable.findMany({
    where: {
      user_id: query?.user_id,
      store_id: query?.store_id,
      clock_in_at: {
        gte: query?.from ? jakartaDayStart(query.from) : undefined,
        lte: query?.to ? jakartaDayEnd(query.to) : undefined,
      },
    },
    orderBy: { clock_in_at: "desc" },
    with: {
      store: {
        columns: { id: true, code: true, name: true },
      },
      user: {
        columns: { id: true, name: true, username: true, role: true },
      },
    },
    limit,
    offset,
  });
}

export function countShifts(query?: GetShiftsQuery) {
  return db.$count(shiftsTable, buildCountWhere(query));
}
