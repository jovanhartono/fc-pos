import "@/test-support/pglite";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  setSystemTime,
} from "bun:test";
import { eq, sql } from "drizzle-orm";
import { shiftsTable, storesTable } from "@/db/schema";
import { BadRequestException, ForbiddenException } from "@/http-exceptions";
import { PATCHShiftSchema } from "@/modules/shifts/shift.schema";
import { captureRejection } from "@/test-support/capture-rejection";
import { type Shop, seedShop } from "@/test-support/fixtures";
import { resetDb, testDb } from "@/test-support/pglite";
import type { JWTPayload } from "@/types";

// A Forgotten clock-out at Kemang. Overtime is paid from Shift hours, so a
// forgotten one gets a normal ten-hour day, capped at midnight, until an admin
// enters the real time (ADR-0025).

const { clockIn, clockOut, closeForgottenShifts, createShift, updateShift } =
  await import("@/modules/shifts/shift.service");

const jkt = (local: string) => new Date(`${local}:00+07:00`);

let shop: Shop;

const openShift = async (
  userId: number,
  clockInAt: Date,
  closed?: { clock_out_at: Date; auto_closed: boolean }
) => {
  const [shift] = await testDb
    .insert(shiftsTable)
    .values({
      clock_in_at: clockInAt,
      store_id: shop.store.id,
      user_id: userId,
      ...closed,
    })
    .returning();
  return shift;
};

const reload = async (id: number) => {
  const [shift] = await testDb
    .select()
    .from(shiftsTable)
    .where(eq(shiftsTable.id, id));
  return shift;
};

const asUser = (id: number, role: JWTPayload["role"] = "cashier") =>
  ({ id, role }) as JWTPayload;

const AT_KEMANG = { accuracy_m: 10, latitude: -6.26, longitude: 106.81 };

beforeAll(async () => {
  // Far from both UTC and Jakarta, so a midnight that leans on the session's
  // timezone lands on the wrong hour.
  await testDb.execute(sql`SET TIME ZONE 'Pacific/Honolulu'`);
});

beforeEach(async () => {
  await resetDb();
  shop = await seedShop();
});

afterAll(() => setSystemTime());

describe("a Forgotten clock-out", () => {
  it("gets ten hours when tapped out the next day, not 31", async () => {
    // Row 52 in prod: in at 08:29, tapped Clock out at 15:30 the next day.
    const shift = await openShift(shop.cashier.id, jkt("2026-10-11T08:29"));
    setSystemTime(jkt("2026-10-12T15:30"));

    const { message } = await clockOut(asUser(shop.cashier.id));

    const closed = await reload(shift.id);
    expect(closed.clock_out_at).toEqual(jkt("2026-10-11T18:29"));
    expect(closed.auto_closed).toBe(true);
    expect(message).toBe(
      "You forgot to clock out on 11 Oct. Shift closed at 18:29."
    );
  });

  it("stops at midnight for an afternoon start", async () => {
    const shift = await openShift(shop.cashier.id, jkt("2026-10-11T16:31"));
    setSystemTime(jkt("2026-10-12T09:00"));

    await clockOut(asUser(shop.cashier.id));

    expect((await reload(shift.id)).clock_out_at).toEqual(
      jkt("2026-10-12T00:00")
    );
  });

  it("keeps the real time on a Shift opened today, however long", async () => {
    const shift = await openShift(shop.cashier.id, jkt("2026-10-12T06:00"));
    setSystemTime(jkt("2026-10-12T23:00"));

    const { message } = await clockOut(asUser(shop.cashier.id));

    const closed = await reload(shift.id);
    expect(closed.clock_out_at).toEqual(jkt("2026-10-12T23:00"));
    expect(closed.auto_closed).toBe(false);
    expect(message).toBe("Clocked out");
  });
});

describe("closeForgottenShifts", () => {
  it("closes every Shift opened before midnight at ten hours", async () => {
    const lastNight = await openShift(shop.cashier.id, jkt("2026-10-11T08:29"));
    // The cron missed two nights before this one.
    const daysAgo = await openShift(shop.admin.id, jkt("2026-10-09T09:00"));
    setSystemTime(jkt("2026-10-12T00:00"));

    const { closed } = await closeForgottenShifts();

    expect(closed).toBe(2);
    expect((await reload(lastNight.id)).clock_out_at).toEqual(
      jkt("2026-10-11T18:29")
    );
    expect((await reload(daysAgo.id)).clock_out_at).toEqual(
      jkt("2026-10-09T19:00")
    );
  });

  it("leaves a Shift opened after midnight alone", async () => {
    const early = await openShift(shop.cashier.id, jkt("2026-10-12T00:00"));
    setSystemTime(jkt("2026-10-12T00:01"));

    const { closed } = await closeForgottenShifts();

    expect(closed).toBe(0);
    expect((await reload(early.id)).clock_out_at).toBeNull();
  });
});

describe("clockIn after the cron closed yesterday", () => {
  const clockInAtKemang = () =>
    clockIn({
      user: asUser(shop.cashier.id),
      storeId: shop.store.id,
      coordinates: AT_KEMANG,
    });

  it("tells the worker their day was cut to ten hours", async () => {
    await openShift(shop.cashier.id, jkt("2026-10-11T08:29"), {
      auto_closed: true,
      clock_out_at: jkt("2026-10-11T18:29"),
    });

    const { message } = await clockInAtKemang();

    expect(message).toBe(
      "Clocked in. You forgot to clock out on 11 Oct. Shift closed at 18:29."
    );
  });

  it("says nothing once a normal day has followed it", async () => {
    await openShift(shop.cashier.id, jkt("2026-10-11T08:29"), {
      auto_closed: true,
      clock_out_at: jkt("2026-10-11T18:29"),
    });
    await openShift(shop.cashier.id, jkt("2026-10-12T08:00"), {
      auto_closed: false,
      clock_out_at: jkt("2026-10-12T18:00"),
    });

    const { message } = await clockInAtKemang();

    expect(message).toBe("Clocked in");
  });
});

describe("updateShift", () => {
  const admin = () => asUser(shop.admin.id, "admin");

  it("records the real overtime and who entered it", async () => {
    const shift = await openShift(shop.cashier.id, jkt("2026-10-11T08:29"), {
      auto_closed: true,
      clock_out_at: jkt("2026-10-11T18:29"),
    });
    setSystemTime(jkt("2026-10-12T10:00"));

    await updateShift({
      user: admin(),
      shiftId: shift.id,
      body: {
        clock_in_at: jkt("2026-10-11T08:29"),
        clock_out_at: jkt("2026-10-11T21:00"),
      },
    });

    const edited = await reload(shift.id);
    expect(edited.clock_out_at).toEqual(jkt("2026-10-11T21:00"));
    expect(edited.auto_closed).toBe(false);
    expect(edited.edited_by).toBe(shop.admin.id);
  });

  it("closes a Shift that is still open", async () => {
    const shift = await openShift(shop.cashier.id, jkt("2026-10-12T08:00"));
    setSystemTime(jkt("2026-10-12T20:00"));

    await updateShift({
      user: admin(),
      shiftId: shift.id,
      body: {
        clock_in_at: jkt("2026-10-12T08:00"),
        clock_out_at: jkt("2026-10-12T18:00"),
      },
    });

    expect((await reload(shift.id)).clock_out_at).toEqual(
      jkt("2026-10-12T18:00")
    );
  });

  it("refuses times that run into the worker's next Shift", async () => {
    const monday = await openShift(shop.cashier.id, jkt("2026-10-11T08:00"), {
      auto_closed: true,
      clock_out_at: jkt("2026-10-11T18:00"),
    });
    await openShift(shop.cashier.id, jkt("2026-10-12T08:00"));
    setSystemTime(jkt("2026-10-12T10:00"));

    const error = await captureRejection(
      updateShift({
        user: admin(),
        shiftId: monday.id,
        body: {
          clock_in_at: jkt("2026-10-11T08:00"),
          clock_out_at: jkt("2026-10-12T09:00"),
        },
      })
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect((await reload(monday.id)).clock_out_at).toEqual(
      jkt("2026-10-11T18:00")
    );
  });

  it("refuses a clock-out that has not happened yet", async () => {
    const shift = await openShift(shop.cashier.id, jkt("2026-10-12T08:00"));
    setSystemTime(jkt("2026-10-12T12:00"));

    const error = await captureRejection(
      updateShift({
        user: admin(),
        shiftId: shift.id,
        body: {
          clock_in_at: jkt("2026-10-12T08:00"),
          clock_out_at: jkt("2026-10-12T18:00"),
        },
      })
    );

    expect(error).toBeInstanceOf(BadRequestException);
  });

  it("is for admins only: overtime is money", async () => {
    const shift = await openShift(shop.cashier.id, jkt("2026-10-11T08:00"), {
      auto_closed: true,
      clock_out_at: jkt("2026-10-11T18:00"),
    });
    setSystemTime(jkt("2026-10-12T10:00"));

    const error = await captureRejection(
      updateShift({
        user: asUser(shop.cashier.id),
        shiftId: shift.id,
        body: {
          clock_in_at: jkt("2026-10-11T08:00"),
          clock_out_at: jkt("2026-10-11T23:00"),
        },
      })
    );

    expect(error).toBeInstanceOf(ForbiddenException);
    expect((await reload(shift.id)).edited_by).toBeNull();
  });
});

describe("createShift", () => {
  const admin = () => asUser(shop.admin.id, "admin");
  const day = {
    clock_in_at: jkt("2026-10-12T08:00"),
    clock_out_at: jkt("2026-10-12T18:00"),
  };

  it("records today's work after yesterday's Shift was the one tapped out", async () => {
    await openShift(shop.cashier.id, jkt("2026-10-11T08:00"));
    setSystemTime(jkt("2026-10-12T18:30"));
    await clockOut(asUser(shop.cashier.id));

    const shift = await createShift({
      user: admin(),
      body: { ...day, store_id: shop.store.id, user_id: shop.cashier.id },
    });

    const saved = await reload(shift.id);
    expect(saved.clock_out_at).toEqual(day.clock_out_at);
    expect(saved.auto_closed).toBe(false);
    expect(saved.edited_by).toBe(shop.admin.id);
  });

  it("refuses a store that has closed", async () => {
    setSystemTime(jkt("2026-10-12T18:30"));
    await testDb
      .update(storesTable)
      .set({ is_active: false })
      .where(eq(storesTable.id, shop.store.id));

    const error = await captureRejection(
      createShift({
        user: admin(),
        body: { ...day, store_id: shop.store.id, user_id: shop.cashier.id },
      })
    );

    expect(error).toBeInstanceOf(BadRequestException);
  });

  it("refuses a store the worker is not assigned to", async () => {
    setSystemTime(jkt("2026-10-12T18:30"));
    const [elsewhere] = await testDb
      .insert(storesTable)
      .values({
        address: "Jl. Bintaro 1",
        code: "BTR",
        is_active: true,
        latitude: "-6.30",
        longitude: "106.65",
        name: "Fresclean Bintaro",
        phone_number: "+622100000000",
      })
      .returning();

    const error = await captureRejection(
      createShift({
        user: admin(),
        body: { ...day, store_id: elsewhere.id, user_id: shop.cashier.id },
      })
    );

    expect(error).toBeInstanceOf(BadRequestException);
  });

  it("refuses a day the worker already has a Shift on", async () => {
    await openShift(shop.cashier.id, jkt("2026-10-12T09:00"), {
      auto_closed: false,
      clock_out_at: jkt("2026-10-12T17:00"),
    });
    setSystemTime(jkt("2026-10-12T18:30"));

    const error = await captureRejection(
      createShift({
        user: admin(),
        body: { ...day, store_id: shop.store.id, user_id: shop.cashier.id },
      })
    );

    expect(error).toBeInstanceOf(BadRequestException);
  });

  it("is for admins only", async () => {
    setSystemTime(jkt("2026-10-12T18:30"));

    const error = await captureRejection(
      createShift({
        user: asUser(shop.cashier.id),
        body: { ...day, store_id: shop.store.id, user_id: shop.cashier.id },
      })
    );

    expect(error).toBeInstanceOf(ForbiddenException);
  });
});

describe("PATCHShiftSchema", () => {
  const parse = (inAt: unknown, outAt: unknown) =>
    PATCHShiftSchema.safeParse({ clock_in_at: inAt, clock_out_at: outAt })
      .success;

  it("refuses a clock-out before the clock-in", () => {
    expect(parse("2026-10-11T11:00:00Z", "2026-10-11T01:00:00Z")).toBe(false);
  });

  it("refuses a Shift over 24 hours, the 18:00 → 08:00 typo two days on", () => {
    expect(parse("2026-10-11T11:00:00Z", "2026-10-13T01:00:00Z")).toBe(false);
  });

  it("refuses a missing time instead of reading it as 1970", () => {
    expect(parse(null, "2026-10-11T11:00:00Z")).toBe(false);
  });
});
