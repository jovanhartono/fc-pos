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
  createStore: () => Promise.resolve({ id: 10, name: "Kemang" }),
  getStoreById: () => Promise.resolve(null),
  getStores: () => Promise.resolve([]),
  updateStore: () => Promise.resolve({ id: 10, name: "Kemang" }),
  updateStoreStatus: () =>
    Promise.resolve({ id: 10, name: "Kemang", is_active: true }),
}));

const storeRoutes = (await import("@/routes/admin/stores")).default;

const asep: JWTPayload = {
  id: 7,
  name: "Asep",
  username: "asep",
  role: "cashier",
  can_process_pickup: false,
};

const buAdmin: JWTPayload = {
  id: 8,
  name: "Bu Admin",
  username: "admin",
  role: "admin",
  can_process_pickup: false,
};

const appFor = (user: JWTPayload) => {
  const app = new Hono<{ Variables: { jwtPayload: JWTPayload } }>()
    .use("*", async (c, next) => {
      c.set("jwtPayload", user);
      await next();
    })
    .route("/stores", storeRoutes);

  app.onError(errorHandler);
  return app;
};

const app = appFor(asep);

const register = (storeId: number, body: unknown) =>
  app.request(`/stores/${storeId}/devices`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const listDevices = (storeId: number) =>
  app.request(`/stores/${storeId}/devices`);

const removeDevice = (storeId: number, deviceId: number) =>
  app.request(`/stores/${storeId}/devices/${deviceId}`, { method: "DELETE" });

beforeEach(() => {
  registered.length = 0;
});

describe("registering a Bluetooth device from the POS", () => {
  it("lets a cashier register a device for the store they work at", async () => {
    const res = await register(KEMANG, {
      name: "  CBT-80-0F2A ",
      label: " Kasir 1 ",
    });

    expect(res.status).toBe(201);
    // Some printers announce themselves with a space on the end. Printing
    // matches that name letter for letter, so it is stored as it arrives; the
    // label a cashier types is tidied up.
    expect(registered).toEqual([
      {
        storeId: KEMANG,
        payload: { name: "  CBT-80-0F2A ", label: "Kasir 1" },
      },
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

// The list and the removal are the same branch question as the registration,
// and each handler asks it for itself — so each one is tested for itself.
describe("reading and removing another store's devices", () => {
  it("refuses to list them", async () => {
    expect((await listDevices(BINTARO)).status).toBe(403);
    expect((await listDevices(KEMANG)).status).toBe(200);
  });

  it("refuses to remove one", async () => {
    expect((await removeDevice(BINTARO, 1)).status).toBe(403);
    // Kemang clears the branch check; the store has no such device to remove.
    expect((await removeDevice(KEMANG, 1)).status).toBe(404);
  });
});

const storeBody = {
  code: "KMG",
  name: "Kemang",
  phone_number: "+628123456789",
  address: "Jl. Kemang Raya No. 1",
  latitude: -6.2,
  longitude: 106.8,
  is_active: true,
};

const createStoreAs = (user: JWTPayload) =>
  appFor(user).request("/stores", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(storeBody),
  });

const editStoreAs = (user: JWTPayload) =>
  appFor(user).request("/stores/10", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });

const setStoreStatusAs = (user: JWTPayload) =>
  appFor(user).request("/stores/10", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ is_active: true }),
  });

// Opening a Store or changing its details is an admin decision — see the
// ADR-0004 row this task added. Registering the printer at the counter is not,
// so a cashier keeps that door open even though the Store edit doors closed.
describe("admin-only store writes", () => {
  it("refuses a cashier's new store", async () => {
    expect((await createStoreAs(asep)).status).toBe(403);
  });

  it("lets an admin open a new store", async () => {
    expect((await createStoreAs(buAdmin)).status).toBe(201);
  });

  it("refuses a cashier's store edit", async () => {
    expect((await editStoreAs(asep)).status).toBe(403);
  });

  it("lets an admin edit a store", async () => {
    expect((await editStoreAs(buAdmin)).status).toBe(200);
  });

  it("refuses a cashier's activate/deactivate", async () => {
    expect((await setStoreStatusAs(asep)).status).toBe(403);
  });

  it("lets an admin activate/deactivate a store", async () => {
    expect((await setStoreStatusAs(buAdmin)).status).toBe(200);
  });

  it("still lets a cashier with store access register a device", async () => {
    expect((await register(KEMANG, { name: "CBT-80-0F2A" })).status).toBe(201);
  });
});
