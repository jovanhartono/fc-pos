import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";
import { ForbiddenException } from "@/http-exceptions";
import type { JWTPayload } from "@/types";
import { errorHandler } from "@/utils/error-handler";

const KEMANG = 1;
const BINTARO = 2;

mock.module("@/utils/authorization", () => ({
  assertStoreAccess: (user: JWTPayload, storeId: number) => {
    if (user.role !== "admin" && storeId !== KEMANG) {
      throw new ForbiddenException("You do not have access to this store");
    }
    return Promise.resolve();
  },
}));

const asked: number[] = [];

mock.module("@/modules/counter/counter.service", () => ({
  getCounter: (storeId: number) => {
    asked.push(storeId);
    return Promise.resolve({ categories: [] });
  },
  getPickupShelf: ({ store_id }: { store_id: number }) => {
    asked.push(store_id);
    return Promise.resolve({
      items: [],
      meta: { limit: 20, offset: 0, total: 0 },
    });
  },
}));

mock.module("@/modules/counter/day-close.service", () => ({
  getDayClose: (storeId: number) => {
    asked.push(storeId);
    return Promise.resolve({ date: "2026-09-30" });
  },
}));

const counterRoutes = (await import("@/routes/admin/counter")).default;

let who: JWTPayload;

const as = (role: JWTPayload["role"]): JWTPayload => ({
  can_process_pickup: false,
  id: 7,
  name: "Asep",
  role,
  username: "asep",
});

const app = new Hono<{ Variables: { jwtPayload: JWTPayload } }>()
  .use("*", async (c, next) => {
    c.set("jwtPayload", who);
    await next();
  })
  .route("/counter", counterRoutes);

app.onError(errorHandler);

const call = (path: string) => app.request(`/counter${path}`);

beforeEach(() => {
  asked.length = 0;
  who = as("cashier");
});

describe("who may read the Counter", () => {
  it("answers shop staff for their own Store", async () => {
    for (const role of ["admin", "cashier", "worker"] as const) {
      who = as(role);
      const res = await call(`?store_id=${KEMANG}`);

      expect(res.status).toBe(200);
    }
    expect(asked).toEqual([KEMANG, KEMANG, KEMANG]);
  });

  it("refuses a courier", async () => {
    who = as("courier");
    const res = await call(`?store_id=${KEMANG}`);

    expect(res.status).toBe(403);
    expect(asked).toEqual([]);
  });

  it("refuses a cashier asking about another Store", async () => {
    const res = await call(`?store_id=${BINTARO}`);

    expect(res.status).toBe(403);
    expect(asked).toEqual([]);
  });

  it("lets an admin read any Store", async () => {
    who = as("admin");
    const res = await call(`?store_id=${BINTARO}`);

    expect(res.status).toBe(200);
  });

  it("needs a Store", async () => {
    const res = await call("");

    expect(res.status).toBe(400);
  });
});

describe("who may read the pickup shelf", () => {
  const path = (storeId: number) => `/pickup-shelf?store_id=${storeId}`;

  it("answers shop staff for their own Store", async () => {
    for (const role of ["admin", "cashier", "worker"] as const) {
      who = as(role);
      expect((await call(path(KEMANG))).status).toBe(200);
    }
    expect(asked).toEqual([KEMANG, KEMANG, KEMANG]);
  });

  it("refuses a courier", async () => {
    who = as("courier");
    expect((await call(path(KEMANG))).status).toBe(403);
    expect(asked).toEqual([]);
  });

  it("refuses a cashier asking about another Store", async () => {
    expect((await call(path(BINTARO))).status).toBe(403);
    expect(asked).toEqual([]);
  });

  it("lets an admin read any Store", async () => {
    who = as("admin");
    expect((await call(path(BINTARO))).status).toBe(200);
  });
});

describe("who may read the day close", () => {
  const path = (storeId: number) =>
    `/day-close?store_id=${storeId}&date=2026-09-30`;

  it("answers admin, cashier and worker for their own Store", async () => {
    for (const role of ["admin", "cashier", "worker"] as const) {
      who = as(role);
      expect((await call(path(KEMANG))).status).toBe(200);
    }
    expect(asked).toEqual([KEMANG, KEMANG, KEMANG]);
  });

  it("refuses a courier", async () => {
    who = as("courier");
    expect((await call(path(KEMANG))).status).toBe(403);
    expect(asked).toEqual([]);
  });

  it("refuses a cashier asking about another Store", async () => {
    expect((await call(path(BINTARO))).status).toBe(403);
    expect(asked).toEqual([]);
  });

  it("refuses a worker asking about another Store", async () => {
    who = as("worker");
    expect((await call(path(BINTARO))).status).toBe(403);
    expect(asked).toEqual([]);
  });

  it("needs a date", async () => {
    expect((await call(`/day-close?store_id=${KEMANG}`)).status).toBe(400);
  });
});
