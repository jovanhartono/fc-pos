import { and, eq, gte, isNull, lt, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { shiftsTable } from "@/db/schema";
import {
  FORGOTTEN_SHIFT_HOURS,
  type GetShiftsQuery,
} from "@/modules/shifts/shift.schema";
import { jakartaDayEnd, jakartaDayStart } from "@/utils/date";

export interface InsertShiftValues {
  clock_in_at?: Date;
  clock_out_at?: Date;
  edited_by?: number;
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

// A Forgotten clock-out gets a normal day, capped at midnight, so payroll pays
// no overtime nobody worked (ADR-0025). Cron, clock-in and clock-out share it.
export function closeOpenShiftsBefore(cutoff: Date, userId?: number) {
  // The SQL twin of jakartaDayStart(clock-in) + 1 day; timestamps are UTC wall clock.
  const nextMidnight = sql`((date_trunc('day', (${shiftsTable.clock_in_at} AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta') + interval '1 day') AT TIME ZONE 'Asia/Jakarta') AT TIME ZONE 'UTC'`;
  return db
    .update(shiftsTable)
    .set({
      clock_out_at: sql`LEAST(${shiftsTable.clock_in_at} + make_interval(hours => ${FORGOTTEN_SHIFT_HOURS}), ${nextMidnight})`,
      auto_closed: true,
    })
    .where(
      and(
        isNull(shiftsTable.clock_out_at),
        lt(shiftsTable.clock_in_at, cutoff),
        userId === undefined ? undefined : eq(shiftsTable.user_id, userId)
      )
    )
    .returning();
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

export function updateOpenShiftClockOutByUserId(userId: number) {
  return db
    .update(shiftsTable)
    .set({ clock_out_at: new Date() })
    .where(
      and(eq(shiftsTable.user_id, userId), isNull(shiftsTable.clock_out_at))
    )
    .returning()
    .then((rows) => rows[0] ?? null);
}

export function findShiftById(shiftId: number) {
  return db.query.shiftsTable.findFirst({ where: { id: shiftId } });
}

export function findLatestShiftByUserId(userId: number) {
  return db.query.shiftsTable.findFirst({
    where: { user_id: userId },
    orderBy: { clock_in_at: "desc" },
  });
}

// Another Shift of the same worker sharing any moment with [clockIn, clockOut).
// An open Shift runs on with no end.
export function findOverlappingShift({
  shiftId,
  userId,
  clockIn,
  clockOut,
}: {
  shiftId?: number;
  userId: number;
  clockIn: Date;
  clockOut: Date;
}) {
  return db.query.shiftsTable.findFirst({
    where: {
      id: shiftId === undefined ? undefined : { ne: shiftId },
      user_id: userId,
      clock_in_at: { lt: clockOut },
      OR: [
        { clock_out_at: { isNull: true } },
        { clock_out_at: { gt: clockIn } },
      ],
    },
  });
}

export function updateShiftTimesById(
  shiftId: number,
  values: { clock_in_at: Date; clock_out_at: Date; edited_by: number }
) {
  return db
    .update(shiftsTable)
    .set({ ...values, auto_closed: false })
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
    columns: {
      id: true,
      user_id: true,
      store_id: true,
      clock_in_at: true,
      clock_out_at: true,
      auto_closed: true,
    },
    orderBy: { clock_in_at: "desc" },
    with: {
      editedBy: {
        columns: { id: true, name: true },
      },
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
