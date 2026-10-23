import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";
import type { AuthUser } from "@/types";
import { errorHandler } from "@/utils/error-handler";

mock.module("@/db", () => ({ db: {} }));

const asked: unknown[] = [];

mock.module("@/modules/shifts/shift.service", () => ({
  clockIn: () => Promise.resolve({ message: "", shift: null }),
  clockOut: () => Promise.resolve({ message: "", shift: null }),
  createShift: () => Promise.resolve(null),
  getCurrentShift: () => Promise.resolve(null),
  getShifts: () => Promise.resolve({ items: [], meta: {} }),
  getShiftsOverview: (_user: AuthUser, query: unknown) => {
    asked.push(query);
    return Promise.resolve({ days: [], people: [] });
  },
  updateShift: () => Promise.resolve(null),
}));

const shiftRoutes = (await import("@/routes/admin/shifts")).default;

const buAdmin: AuthUser = {
  can_process_pickup: false,
  id: 8,
  name: "Bu Admin",
  role: "admin",
  store_ids: [],
  username: "admin",
};

const overview = (query: string) => {
  const app = new Hono<{ Variables: { jwtPayload: AuthUser } }>()
    .use("*", async (c, next) => {
      c.set("jwtPayload", buAdmin);
      await next();
    })
    .route("/shifts", shiftRoutes);
  app.onError(errorHandler);
  return app.request(`/shifts/overview?${query}`);
};

beforeEach(() => {
  asked.length = 0;
});

describe("the Shifts page overview", () => {
  it("reads the range and Store off the querystring", async () => {
    const res = await overview("from=2026-09-23&to=2026-10-22&store_id=2");

    expect(res.status).toBe(200);
    expect(asked).toEqual([
      { from: "2026-09-23", store_id: 2, to: "2026-10-22" },
    ]);
  });

  it("refuses a range that ends before it starts", async () => {
    const res = await overview("from=2026-10-22&to=2026-10-01");

    expect(res.status).toBe(400);
    expect(asked).toEqual([]);
  });

  it("refuses a range without both ends", async () => {
    const res = await overview("from=2026-10-22");

    expect(res.status).toBe(400);
    expect(asked).toEqual([]);
  });
});
