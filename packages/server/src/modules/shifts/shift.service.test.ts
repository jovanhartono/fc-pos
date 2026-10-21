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

// ADR-0020 turns a worker away only when the phone is sure they are elsewhere:
// a sharp fix from home is refused, a fix too vague to judge is let through.

const KEMANG = { latitude: "-6.26157800", longitude: "106.81273500" };
const BINTARO = { latitude: "-6.30184500", longitude: "106.65241300" };

const storeState = {
  coordinates: new Map<number, { latitude: string; longitude: string }>(),
  lookups: [] as number[],
};

const shiftState = {
  openShift: undefined as { id: number; clock_out_at: null } | undefined,
  inserted: undefined as Record<string, unknown> | undefined,
  closedBefore: undefined as Date | undefined,
  closedCount: 0,
  // Rows the guarded update closed: none when the open shift started today.
  staleClosed: [] as {
    auto_closed: boolean;
    clock_in_at: Date;
    clock_out_at: Date;
  }[],
  staleCutoff: undefined as Date | undefined,
};

const membership = { storeIds: [1, 2] };

// store.repository prepares statements at import, so the stub must answer any
// table first. mock.module is process-wide, so the repositories go back after.
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
      return Promise.resolve(
        Array.from({ length: shiftState.closedCount }, (_, id) => ({ id }))
      );
    }
    shiftState.staleCutoff = cutoff;
    return Promise.resolve(shiftState.staleClosed);
  },
  findLatestShiftByUserId: () => Promise.resolve(shiftState.openShift),
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

// Phones due south of the Kemang counter. Accuracy is the phone's own error
// radius: metres outdoors, kilometres from a cell tower.
const AT_THE_COUNTER = {
  accuracy_m: 12,
  latitude: -6.261_848,
  longitude: 106.812_735,
};
// 6.2 km out, and the phone is sure. Nobody can argue with this one.
const FROM_HOME = {
  accuracy_m: 18,
  latitude: -6.317_648,
  longitude: 106.812_735,
};
// 4.1 km out on paper, but the circle is 3.2 km wide, so the counter is inside
// it. This is the worker indoors on a rainy day, not the worker in bed.
const FIX_TOO_VAGUE_TO_JUDGE = {
  accuracy_m: 3200,
  latitude: -6.298_658,
  longitude: 106.812_735,
};
// 10 km out with the same useless circle: even its near edge is 6.8 km away.
const FAR_AND_VAGUE = {
  accuracy_m: 3200,
  latitude: -6.352_018,
  longitude: 106.812_735,
};

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
  shiftState.staleClosed = [];
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

  it("opens the shift for a worker at the counter", async () => {
    const shift = await clockIn({
      user: WORKER,
      storeId: 1,
      coordinates: AT_THE_COUNTER,
    });

    expect(shift).toBeDefined();
    // Nothing about where the worker was survives the check.
    expect(shiftState.inserted).toEqual({ store_id: 1, user_id: 7 });
  });

  it("turns away a worker 6.2 km from the store", async () => {
    const error = await captureRejection(
      clockIn({ user: WORKER, storeId: 1, coordinates: FROM_HOME })
    );

    expect(error).toBeInstanceOf(BadRequestException);
    // The distance belongs in the message: it is what a manager gets quoted.
    expect((error as Error).message).toContain("6.2 km");
    expect(shiftState.inserted).toBeUndefined();
  });

  it("lets a worker in when the fix is too vague to place them", async () => {
    const shift = await clockIn({
      user: WORKER,
      storeId: 1,
      coordinates: FIX_TOO_VAGUE_TO_JUDGE,
    });

    // The circle covers the counter, so nobody can say they were not at it.
    expect(shift).toBeDefined();
  });

  it("turns away a worker too far for even a vague fix to excuse", async () => {
    const error = await captureRejection(
      clockIn({ user: WORKER, storeId: 1, coordinates: FAR_AND_VAGUE })
    );

    expect(error).toBeInstanceOf(BadRequestException);
    expect(shiftState.inserted).toBeUndefined();
  });

  it("measures against the store the worker picked, not the nearest one", async () => {
    // Standing at the Kemang counter but clocking in against Bintaro, 18 km west.
    const error = await captureRejection(
      clockIn({ user: WORKER, storeId: 2, coordinates: AT_THE_COUNTER })
    );

    expect(storeState.lookups).toEqual([2]);
    expect(error).toBeInstanceOf(BadRequestException);
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
    shiftState.openShift = { id: 5, clock_out_at: null };
    shiftState.staleClosed = [];

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
    shiftState.openShift = { id: 5, clock_out_at: null };
    shiftState.staleClosed = [
      {
        auto_closed: true,
        clock_in_at: new Date("2026-09-08T01:30:00.000Z"), // 08:30 Jakarta
        clock_out_at: new Date("2026-09-08T11:30:00.000Z"), // 18:30 Jakarta
      },
    ];

    const { shift, message } = await clockIn({
      user: WORKER,
      storeId: 1,
      coordinates: AT_THE_COUNTER,
    });

    expect(shift).toBeDefined();
    expect(message).toBe(
      "Clocked in. You forgot to clock out on 8 Sep. Shift closed at 18:30."
    );
    expect(shiftState.inserted).toMatchObject({ store_id: 1, user_id: 7 });
    // Any row opened before this morning is a Forgotten clock-out.
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

  it("reaches every Shift opened before the midnight it fires at", async () => {
    // Half a minute past midnight Jakarta on 9 September, when the cron fires.
    setSystemTime(new Date("2026-09-08T17:00:30.000Z"));

    await closeForgottenShifts();

    // Nobody works past midnight, so all of 8 September is in reach.
    expect(shiftState.closedBefore?.toISOString()).toBe(
      "2026-09-08T17:00:00.000Z"
    );
  });
});
