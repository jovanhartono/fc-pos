import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";
import { ForbiddenException } from "@/http-exceptions";
import type { JWTPayload } from "@/types";
import { errorHandler } from "@/utils/error-handler";

// Asep is rostered at Kemang. Bintaro is the store across town whose printer
// he once picked by mistake from the unfiltered chooser.
const KEMANG = 1;
const BINTARO = 2;

// The stores routes reach only assertStoreAccess, so that is all the double
// needs to answer.
mock.module("@/utils/authorization", () => ({
  assertStoreAccess: (user: JWTPayload, storeId: number) => {
    if (user.role !== "admin" && storeId !== KEMANG) {
      throw new ForbiddenException("You do not have access to this store");
    }
    return Promise.resolve();
  },
}));

const updateStoreCalls: { id: number; payload: unknown }[] = [];

mock.module("@/modules/stores/store.service", () => ({
  createStore: () => Promise.resolve({}),
  getNearestStores: () => Promise.resolve([]),
  getStoreById: () => Promise.resolve(null),
  getStores: () => Promise.resolve([]),
  updateStore: ({ id, payload }: { id: number; payload: unknown }) => {
    updateStoreCalls.push({ id, payload });
    return Promise.resolve({ id, name: "Fresclean Kemang" });
  },
  updateStoreStatus: () => Promise.resolve(null),
}));

const storeRoutes = (await import("@/routes/admin/stores")).default;

const asep: JWTPayload = {
  id: 7,
  name: "Asep",
  username: "asep",
  role: "cashier",
  can_process_pickup: false,
};

const app = new Hono<{ Variables: { jwtPayload: JWTPayload } }>()
  .use("*", async (c, next) => {
    c.set("jwtPayload", asep);
    await next();
  })
  .route("/stores", storeRoutes);

app.onError(errorHandler);

const rememberPrinter = (storeId: number, printer_name: string) =>
  app.request(`/stores/${storeId}/printer`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ printer_name }),
  });

beforeEach(() => {
  updateStoreCalls.length = 0;
});

describe("remembering the receipt printer a POS just paired", () => {
  it("lets a cashier remember the printer for the store they work at", async () => {
    const res = await rememberPrinter(KEMANG, "  CBT-80-0F2A ");

    expect(res.status).toBe(200);
    // Trimmed: the chooser filters on the exact advertised string.
    expect(updateStoreCalls).toEqual([
      { id: KEMANG, payload: { printer_name: "CBT-80-0F2A" } },
    ]);
  });

  it("refuses to let a Kemang POS point another store's receipts at its printer", async () => {
    const res = await rememberPrinter(BINTARO, "CBT-80-0F2A");

    expect(res.status).toBe(403);
    expect(updateStoreCalls).toEqual([]);
  });

  it("rejects a blank name — forgetting the printer is an admin edit, not a pairing", async () => {
    const res = await rememberPrinter(KEMANG, "   ");

    expect(res.status).toBe(400);
    expect(updateStoreCalls).toEqual([]);
  });
});
