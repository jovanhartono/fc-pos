import { and, eq, gte, isNull, lt, lte } from "drizzle-orm";
import { db } from "@/db";
import { shiftsTable } from "@/db/schema";
import type { GetShiftsQuery } from "@/modules/shifts/shift.schema";
import { jakartaDayEnd, jakartaDayStart } from "@/utils/date";

export interface InsertShiftValues {
  clock_in_distance_km?: string;
  clock_in_latitude?: string;
  clock_in_longitude?: string;
  store_id: number;
  user_id: number;
}

export function insertShift(values: InsertShiftValues) {
  return db
    .insert(shiftsTable)
    .values(values)
    .returning()
    .then((rows) => rows[0]);
}

// A worker who went home without clocking out. Closing at the day boundary
// keeps the hours on the day they were worked and frees them to clock in again.
// The nightly sweep passes no user; a worker clocking in passes their own id to
// clear just their row, and both must file the close the same way.
export function closeOpenShiftsBefore(cutoff: Date, userId?: number) {
  return db
    .update(shiftsTable)
    .set({ clock_out_at: cutoff, auto_closed: true })
    .where(
      and(
        isNull(shiftsTable.clock_out_at),
        lt(shiftsTable.clock_in_at, cutoff),
        userId === undefined ? undefined : eq(shiftsTable.user_id, userId)
      )
    )
    .returning({ id: shiftsTable.id })
    .then((rows) => rows.length);
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
    // The distance, never the coordinates. The Shifts page shows an admin how
    // far each worker was; where each worker's phone was every morning is staff
    // personal data that has no business travelling to a browser.
    columns: {
      id: true,
      user_id: true,
      store_id: true,
      clock_in_at: true,
      clock_out_at: true,
      clock_in_distance_km: true,
      auto_closed: true,
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
