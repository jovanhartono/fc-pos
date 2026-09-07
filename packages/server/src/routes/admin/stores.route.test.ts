import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";
import { ForbiddenException } from "@/http-exceptions";
import type { JWTPayload } from "@/types";
import { errorHandler } from "@/utils/error-handler";

// Asep works at the Kemang store. Bintaro is the store across town whose
// printer he once picked by mistake from the long Bluetooth list.
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

const registered: { storeId: number; payload: unknown }[] = [];

mock.module("@/modules/stores/store-device.service", () => ({
  getStoreDevices: () => Promise.resolve([]),
  registerStoreDevice: (storeId: number, payload: { name: string }) => {
    registered.push({ storeId, payload });
    return Promise.resolve({ id: 1, store_id: storeId, ...payload });
  },
  removeStoreDevice: () => Promise.resolve(null),
}));

mock.module("@/modules/stores/store.service", () => ({
  createStore: () => Promise.resolve({}),
  getNearestStores: () => Promise.resolve([]),
  getStoreById: () => Promise.resolve(null),
  getStores: () => Promise.resolve([]),
  updateStore: () => Promise.resolve(null),
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

const register = (storeId: number, body: unknown) =>
  app.request(`/stores/${storeId}/devices`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  registered.length = 0;
});

describe("registering a Bluetooth device from the POS", () => {
  it("lets a cashier register a device for the store they work at", async () => {
    const res = await register(KEMANG, {
      name: "  CBT-80-0F2A ",
      label: "Kasir 1",
    });

    expect(res.status).toBe(201);
    expect(registered).toEqual([
      { storeId: KEMANG, payload: { name: "CBT-80-0F2A", label: "Kasir 1" } },
    ]);
  });

  it("refuses to let a Kemang POS register a device for another store", async () => {
    const res = await register(BINTARO, { name: "CBT-80-0F2A" });

    expect(res.status).toBe(403);
    expect(registered).toEqual([]);
  });

  it("rejects a device with no Bluetooth name — there is nothing to match on", async () => {
    const res = await register(KEMANG, { name: "   " });

    expect(res.status).toBe(400);
    expect(registered).toEqual([]);
  });
});
