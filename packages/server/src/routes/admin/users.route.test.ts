import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";
import { BadRequestException } from "@/http-exceptions";
import type { AuthUser } from "@/types";
import { errorHandler } from "@/utils/error-handler";

// Budi is the worker who forgot his password and walked over to the office.
const BUDI = 42;
const NOBODY = 99;

const reset: { id: number; password: string }[] = [];
const ownChanges: { userId: number; password: string }[] = [];
const renamed: { id: number; name: string }[] = [];

mock.module("@/modules/users/user.service", () => ({
  changeOwnPassword: ({
    userId,
    currentPassword,
    password,
  }: {
    userId: number;
    currentPassword: string;
    password: string;
  }) => {
    if (currentPassword !== "lama-sekali") {
      return Promise.reject(new BadRequestException("Wrong password"));
    }
    ownChanges.push({ userId, password });
    return Promise.resolve();
  },
  createAvatarPresign: () => ({ key: "k", upload_url: "u" }),
  createUser: () => Promise.resolve({ id: 1 }),
  getCouriers: () => Promise.resolve([{ id: 31, name: "Dedi" }]),
  getUserById: () => Promise.resolve(null),
  getUsers: () => Promise.resolve({ items: [], meta: {} }),
  removeAvatar: () => Promise.resolve(null),
  resetUserPassword: ({ id, password }: { id: number; password: string }) => {
    if (id === NOBODY) {
      return Promise.resolve(null);
    }
    reset.push({ id, password });
    return Promise.resolve({ id, name: "Budi Santoso" });
  },
  saveAvatar: () => Promise.resolve(null),
  updateOwnName: (id: number, name: string) => {
    renamed.push({ id, name });
    return Promise.resolve({ id, name });
  },
  updateUser: () => Promise.resolve(null),
  updateUserStores: () => Promise.resolve(null),
}));

mock.module("@/modules/users/user-performance.service", () => ({
  getOwnPerformance: () => Promise.resolve({ role: "admin" }),
}));

const userRoutes = (await import("@/routes/admin/users")).default;

const buAdmin: AuthUser = {
  id: 8,
  name: "Bu Admin",
  username: "admin",
  role: "admin",
  can_process_pickup: false,
  store_ids: [],
};

const asep: AuthUser = {
  id: 7,
  name: "Asep",
  username: "asep",
  role: "cashier",
  can_process_pickup: false,
  store_ids: [1],
};

const wawan: AuthUser = {
  id: 12,
  name: "Wawan",
  username: "wawan",
  role: "worker",
  can_process_pickup: false,
  store_ids: [1],
};

const dedi: AuthUser = {
  id: 31,
  name: "Dedi",
  username: "dedi",
  role: "courier",
  can_process_pickup: false,
  store_ids: [1],
};

const appFor = (user: AuthUser) => {
  const app = new Hono<{ Variables: { jwtPayload: AuthUser } }>()
    .use("*", async (c, next) => {
      c.set("jwtPayload", user);
      await next();
    })
    .route("/users", userRoutes);

  app.onError(errorHandler);
  return app;
};

const resetPassword = (user: AuthUser, id: number, body: unknown) =>
  appFor(user).request(`/users/${id}/password`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const changeOwnPassword = (user: AuthUser, body: unknown) =>
  appFor(user).request("/users/me/password", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  reset.length = 0;
  ownChanges.length = 0;
  renamed.length = 0;
});

describe("a worker on their own Profile page", () => {
  it("renames only themselves", async () => {
    const res = await appFor(wawan).request("/users/me", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Wawan Setiawan" }),
    });

    expect(res.status).toBe(200);
    expect(renamed).toEqual([{ id: wawan.id, name: "Wawan Setiawan" }]);
  });

  it("refuses a blank name", async () => {
    const res = await appFor(wawan).request("/users/me", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "   " }),
    });

    expect(res.status).toBe(400);
    expect(renamed).toEqual([]);
  });

  it("changes their own password after giving the current one", async () => {
    const res = await changeOwnPassword(wawan, {
      current_password: "lama-sekali",
      password: "baru-sekali",
      confirm_password: "baru-sekali",
    });

    expect(res.status).toBe(200);
    expect(ownChanges).toEqual([{ userId: wawan.id, password: "baru-sekali" }]);
  });

  // A colleague on a phone left signed in at the counter doesn't know it.
  it("says Wrong password when the current one is wrong", async () => {
    const res = await changeOwnPassword(wawan, {
      current_password: "tebak-saja",
      password: "baru-sekali",
      confirm_password: "baru-sekali",
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { message: string };
    expect(body.message).toBe("Wrong password");
    expect(ownChanges).toEqual([]);
  });

  it("rejects a confirmation that does not match", async () => {
    const res = await changeOwnPassword(wawan, {
      current_password: "lama-sekali",
      password: "baru-sekali",
      confirm_password: "baru-sekala",
    });

    expect(res.status).toBe(400);
    expect(ownChanges).toEqual([]);
  });
});

describe("an admin resetting a password for someone who forgot theirs", () => {
  it("accepts the new password and hands it to the service", async () => {
    const res = await resetPassword(buAdmin, BUDI, {
      password: "kucing-biru-42",
      confirm_password: "kucing-biru-42",
    });

    expect(res.status).toBe(200);
    expect(reset).toEqual([{ id: BUDI, password: "kucing-biru-42" }]);
  });

  it("refuses a cashier — only an admin hands out passwords", async () => {
    const res = await resetPassword(asep, BUDI, {
      password: "kucing-biru-42",
      confirm_password: "kucing-biru-42",
    });

    expect(res.status).toBe(403);
    expect(reset).toEqual([]);
  });

  // A typo here means Budi walks back to the office tomorrow, so the two
  // fields have to agree before anything is written.
  it("rejects a confirmation that does not match", async () => {
    const res = await resetPassword(buAdmin, BUDI, {
      password: "kucing-biru-42",
      confirm_password: "kucing-biru-43",
    });

    expect(res.status).toBe(400);
    expect(reset).toEqual([]);
  });

  it("rejects a password under 8 characters", async () => {
    const res = await resetPassword(buAdmin, BUDI, {
      password: "kucing",
      confirm_password: "kucing",
    });

    expect(res.status).toBe(400);
    expect(reset).toEqual([]);
  });

  it("answers 404 for a user who is not there", async () => {
    const res = await resetPassword(buAdmin, NOBODY, {
      password: "kucing-biru-42",
      confirm_password: "kucing-biru-42",
    });

    expect(res.status).toBe(404);
  });
});

// Whoever rings up a drop-off at the counter picks the Courier who brought it in.
describe("listing Couriers for the counter", () => {
  it.each([
    ["an admin", buAdmin],
    ["a cashier", asep],
    ["a worker", wawan],
  ])("gives %s the Couriers to pick from", async (_, user) => {
    const res = await appFor(user).request("/users/couriers");

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown };
    expect(body.data).toEqual([{ id: 31, name: "Dedi" }]);
  });

  it("refuses a Courier, who only clocks in", async () => {
    const res = await appFor(dedi).request("/users/couriers");

    expect(res.status).toBe(403);
  });
});
