import {
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  setSystemTime,
} from "bun:test";
import { BadRequestException, NotFoundException } from "@/http-exceptions";
import { authorizationDouble } from "@/test-support/authorization-double";
import { captureRejection } from "@/test-support/capture-rejection";
import type { JWTPayload } from "@/types";

// Clocking in is the shop's attendance record and the source of the hours in
// the worker-productivity report. ADR-0020 splits the two halves of the
// location rule and these tests pin that split: sharing a location is
// mandatory, the distance it reports never refuses the shift. Plus the two
// halves of a forgotten clock-out: clocking in closes yesterday's row so
// nobody is locked out, and the midnight sweep spares anyone still on the
// floor.
//
// Both repositories and the store-access gate are doubled; their own contracts
// are pinned elsewhere.

const KEMANG = { latitude: "-6.26157800", longitude: "106.81273500" };
const BINTARO = { latitude: "-6.30184500", longitude: "106.65241300" };

const storeState = {
  coordinates: new Map<number, { latitude: string; longitude: string }>(),
  lookups: [] as number[],
};

const shiftState = {
  openShift: undefined as { id: number } | undefined,
  inserted: undefined as Record<string, unknown> | undefined,
  closedBefore: undefined as Date | undefined,
  closedCount: 0,
  // Rows the guarded update closed: 0 when the open shift started today.
  staleClosed: 0,
  staleCutoff: undefined as Date | undefined,
};

const membership = { storeIds: [1, 2] };

// store.repository prepares statements at import, so the stub has to answer any
// table with a preparable query before the real module can be pulled in and
// spread. mock.module is global for the whole run: a double that drops an
// export stops an unrelated suite from linking at all, and the two repositories
// go back afterwards.
const preparedStub: Record<string, unknown> = {};
preparedStub.prepare = () => preparedStub;
preparedStub.execute = () => Promise.resolve(undefined);

mock.module("@/db", () => ({
  db: {
    query: new Proxy(
      {},
      { get: () => new Proxy({}, { get: () => () => preparedStub }) }
    ),
  },
}));

const actualStoreRepo = await import("@/modules/stores/store.repository");
const actualShiftRepo = await import("@/modules/shifts/shift.repository");

mock.module("@/utils/authorization", () => authorizationDouble(membership));

mock.module("@/modules/stores/store.repository", () => ({
  ...actualStoreRepo,
  findStoreById: (id: number) => {
    storeState.lookups.push(id);
    return Promise.resolve(storeState.coordinates.get(id));
  },
}));

mock.module("@/modules/shifts/shift.repository", () => ({
  ...actualShiftRepo,
  closeOpenShiftsBefore: (cutoff: Date, userId?: number) => {
    if (userId === undefined) {
      shiftState.closedBefore = cutoff;
      return Promise.resolve(shiftState.closedCount);
    }
    shiftState.staleCutoff = cutoff;
    return Promise.resolve(shiftState.staleClosed);
  },
  findOpenShiftByUserId: () => Promise.resolve(shiftState.openShift),
  insertShift: (values: Record<string, unknown>) => {
    shiftState.inserted = values;
    return Promise.resolve({ id: 99, ...values });
  },
}));

const { clockIn, closeForgottenShifts } = await import(
  "@/modules/shifts/shift.service"
);

afterAll(() => {
  setSystemTime();
  mock.module("@/modules/stores/store.repository", () => actualStoreRepo);
  mock.module("@/modules/shifts/shift.repository", () => actualShiftRepo);
});

const WORKER = { id: 7, role: "worker" } as unknown as JWTPayload;
const COURIER = { id: 8, role: "courier" } as unknown as JWTPayload;

// A phone standing at the Kemang counter, and one at a house 3.1 km away.
const AT_THE_COUNTER = { latitude: -6.261_848, longitude: 106.812_735 };
const FROM_HOME = { latitude: -6.289_478, longitude: 106.812_735 };

beforeEach(() => {
  setSystemTime();
  storeState.coordinates = new Map([
    [1, KEMANG],
    [2, BINTARO],
  ]);
  storeState.lookups = [];
  shiftState.openShift = undefined;
  shiftState.inserted = undefined;
  shiftState.closedBefore = undefined;
  shiftState.closedCount = 0;
  shiftState.staleClosed = 0;
  shiftState.staleCutoff = undefined;
  membership.storeIds = [1, 2];
});

describe("clockIn location rule", () => {
  it("refuses a worker who shares no location", async () => {
    const error = await captureRejection(clockIn({ user: WORKER, storeId: 1 }));

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe("Location is required to clock in");
    expect(shiftState.inserted).toBeUndefined();
  });

  it("records the distance for a worker at the counter", async () => {
    await clockIn({
      user: WORKER,
      storeId: 1,
      coordinates: AT_THE_COUNTER,
    });

    expect(shiftState.inserted).toMatchObject({
      store_id: 1,
      user_id: 7,
    });
    expect(Number(shiftState.inserted?.clock_in_distance_km)).toBeCloseTo(
      0.03,
      2
    );
  });

  it("opens the shift anyway when the worker is 3.1 km away", async () => {
    const shift = await clockIn({
      user: WORKER,
      storeId: 1,
      coordinates: FROM_HOME,
    });

    // The whole point of ADR-0020: the distance is evidence, not a gate.
    expect(shift).toBeDefined();
    expect(Number(shiftState.inserted?.clock_in_distance_km)).toBeCloseTo(
      3.1,
      1
    );
  });

  it("measures against the store the worker picked, not the nearest one", async () => {
    // Standing at Kemang but clocking in against Bintaro, 18 km west.
    await clockIn({
      user: WORKER,
      storeId: 2,
      coordinates: AT_THE_COUNTER,
    });

    expect(storeState.lookups).toEqual([2]);
    expect(Number(shiftState.inserted?.clock_in_distance_km)).toBeGreaterThan(
      15
    );
  });

  it("stores the coordinates the phone reported", async () => {
    await clockIn({
      user: WORKER,
      storeId: 1,
      coordinates: AT_THE_COUNTER,
    });

    expect(Number(shiftState.inserted?.clock_in_latitude)).toBeCloseTo(
      AT_THE_COUNTER.latitude,
      6
    );
    expect(Number(shiftState.inserted?.clock_in_longitude)).toBeCloseTo(
      AT_THE_COUNTER.longitude,
      6
    );
  });

  it("never asks a courier for a location", async () => {
    const shift = await clockIn({ user: COURIER, storeId: 1 });

    expect(shift).toBeDefined();
    expect(storeState.lookups).toEqual([]);
    expect(shiftState.inserted).toEqual({ store_id: 1, user_id: 8 });
  });

  it("rejects a store that does not exist", async () => {
    storeState.coordinates = new Map();

    const error = await captureRejection(
      clockIn({ user: WORKER, storeId: 1, coordinates: AT_THE_COUNTER })
    );

    expect(error).toBeInstanceOf(NotFoundException);
  });

  it("still refuses a shift already opened today", async () => {
    shiftState.openShift = { id: 5 };
    shiftState.staleClosed = 0;

    const error = await captureRejection(
      clockIn({ user: WORKER, storeId: 1, coordinates: AT_THE_COUNTER })
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe("You already have an open shift");
    expect(storeState.lookups).toEqual([]);
    expect(shiftState.inserted).toBeUndefined();
  });
});

describe("clockIn closes a forgotten shift instead of locking the worker out", () => {
  it("opens today's shift once yesterday's row is closed", async () => {
    setSystemTime(new Date("2026-09-09T01:00:00.000Z")); // 08:00 Jakarta
    shiftState.openShift = { id: 5 };
    shiftState.staleClosed = 1;

    const shift = await clockIn({
      user: WORKER,
      storeId: 1,
      coordinates: AT_THE_COUNTER,
    });

    expect(shift).toBeDefined();
    expect(shiftState.inserted).toMatchObject({ store_id: 1, user_id: 7 });
    // Yesterday's row is closed at the day boundary, so the hours stay on the
    // day they were worked rather than running into this morning.
    expect(shiftState.staleCutoff?.toISOString()).toBe(
      "2026-09-08T17:00:00.000Z"
    );
  });
});

describe("closeForgottenShifts", () => {
  it("cuts off at midnight Jakarta", async () => {
    await closeForgottenShifts();

    // WIB is UTC+7 with no daylight saving, so 00:00 Jakarta is 17:00 UTC.
    expect(shiftState.closedBefore?.getUTCHours()).toBe(17);
    expect(shiftState.closedBefore?.getUTCMinutes()).toBe(0);
    expect(shiftState.closedBefore?.getUTCSeconds()).toBe(0);
  });

  it("reports how many it closed", async () => {
    shiftState.closedCount = 3;

    const result = await closeForgottenShifts();

    expect(result.closed).toBe(3);
    expect(result.cutoff).toEqual(shiftState.closedBefore as Date);
  });

  it("spares yesterday, so a 22:30 late close is left on the floor", async () => {
    // Half a minute past midnight Jakarta on 9 September, when the cron fires.
    setSystemTime(new Date("2026-09-08T17:00:30.000Z"));

    await closeForgottenShifts();

    // Start of 8 September Jakarta. Both the 00:02 early delivery and last
    // night's 22:30 late close clocked in after this instant, so neither is in
    // the sweep's reach.
    expect(shiftState.closedBefore?.toISOString()).toBe(
      "2026-09-07T17:00:00.000Z"
    );
  });
});
