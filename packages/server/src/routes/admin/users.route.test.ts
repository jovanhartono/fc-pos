import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";
import type { JWTPayload } from "@/types";
import { errorHandler } from "@/utils/error-handler";

// Budi is the worker who forgot his password and walked over to the office.
const BUDI = 42;
const NOBODY = 99;

const reset: { id: number; password: string }[] = [];

mock.module("@/modules/users/user.service", () => ({
  createUser: () => Promise.resolve({ id: 1 }),
  getUserById: () => Promise.resolve(null),
  getUsers: () => Promise.resolve({ items: [], meta: {} }),
  resetUserPassword: ({ id, password }: { id: number; password: string }) => {
    if (id === NOBODY) {
      return Promise.resolve(null);
    }
    reset.push({ id, password });
    return Promise.resolve({ id, name: "Budi Santoso" });
  },
  updateUser: () => Promise.resolve(null),
  updateUserStores: () => Promise.resolve(null),
}));

const userRoutes = (await import("@/routes/admin/users")).default;

const buAdmin: JWTPayload = {
  id: 8,
  name: "Bu Admin",
  username: "admin",
  role: "admin",
  can_process_pickup: false,
};

const asep: JWTPayload = {
  id: 7,
  name: "Asep",
  username: "asep",
  role: "cashier",
  can_process_pickup: false,
};

const appFor = (user: JWTPayload) => {
  const app = new Hono<{ Variables: { jwtPayload: JWTPayload } }>()
    .use("*", async (c, next) => {
      c.set("jwtPayload", user);
      await next();
    })
    .route("/users", userRoutes);

  app.onError(errorHandler);
  return app;
};

const resetPassword = (user: JWTPayload, id: number, body: unknown) =>
  appFor(user).request(`/users/${id}/password`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  reset.length = 0;
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
