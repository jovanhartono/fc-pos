import { describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";
import type { JwtVariables } from "hono/jwt";
import type { usersTable } from "@/db/schema";
import type { JWTPayload } from "@/types/jwt";
import { errorHandler } from "@/utils/error-handler";

type UserRow = typeof usersTable.$inferSelect;

const executeMock = mock(
  (_args: { username: string }): Promise<UserRow | undefined> =>
    Promise.resolve(undefined)
);

mock.module("@/db", () => ({
  db: {
    query: {
      usersTable: {
        findFirst: () => ({
          prepare: () => ({ execute: executeMock }),
        }),
      },
    },
  },
}));

process.env.JWT_SECRET ??= "test-secret";

const authRoutes = (await import("@/routes/auth")).default;

const app = new Hono<{ Variables: JwtVariables<JWTPayload> }>().route(
  "/auth",
  authRoutes
);
app.onError(errorHandler);

const login = (username: string, password: string) =>
  app.request("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

// A different status or message per failure tells an attacker which half of
// the guess was right, turning login into a way to harvest usernames. Both
// wrong paths must read identically from the outside.
describe("logging in with the wrong credentials", () => {
  it("answers an unknown username with a generic 401", async () => {
    executeMock.mockResolvedValue(undefined);

    const res = await login("ghost", "whatever");

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      message: "Invalid username or password",
      success: false,
    });
  });

  it("answers a wrong password with the same generic 401", async () => {
    executeMock.mockResolvedValue({
      id: 1,
      name: "Asep",
      username: "asep",
      password: await Bun.password.hash("correct-horse"),
      role: "cashier",
      can_process_pickup: false,
      is_active: true,
    } as UserRow);

    const res = await login("asep", "wrong-password");

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      message: "Invalid username or password",
      success: false,
    });
  });
});
