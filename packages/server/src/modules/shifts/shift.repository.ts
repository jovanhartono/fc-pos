import dayjs from "dayjs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { shiftsTable } from "@/db/schema";
import type { GetShiftsQuery } from "@/modules/shifts/shift.schema";

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

export function listShifts(query?: GetShiftsQuery) {
  return db.query.shiftsTable.findMany({
    where: {
      user_id: query?.user_id,
      store_id: query?.store_id,
      clock_in_at: {
        gte: query?.from
          ? dayjs(query.from).startOf("day").toDate()
          : undefined,
        lte: query?.to ? dayjs(query.to).endOf("day").toDate() : undefined,
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
    limit: 500,
  });
}
