import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";
import { sign } from "hono/jwt";
import type { JWTPayload } from "@/types";

type AuthStateRow = Pick<JWTPayload, "role" | "can_process_pickup"> & {
  is_active: boolean;
};

const executeMock = mock(
  (_args: { id: number }): Promise<AuthStateRow | undefined> =>
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
const secret = process.env.JWT_SECRET;

const { adminMiddleware } = await import("@/middlewares/admin");

const app = new Hono<{ Variables: { jwtPayload: JWTPayload } }>();
app.use("/admin/*", adminMiddleware);
app.get("/admin/me", (c) => c.json(c.get("jwtPayload")));

const signToken = (
  overrides: Partial<JWTPayload> = {},
  exp = Math.floor(Date.now() / 1000) + 3600
) =>
  sign(
    {
      id: 1,
      name: "Test",
      username: "test",
      role: "cashier",
      can_process_pickup: false,
      exp,
      ...overrides,
    },
    secret
  );

const getMe = (token?: string) =>
  app.request("/admin/me", {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

beforeEach(() => {
  executeMock.mockClear();
  executeMock.mockResolvedValue(undefined);
});

describe("adminMiddleware — JWT layer", () => {
  it("rejects missing token with 401 without hitting the DB", async () => {
    const res = await getMe();
    expect(res.status).toBe(401);
    expect(executeMock).not.toHaveBeenCalled();
  });

  it("rejects garbage token with 401 without hitting the DB", async () => {
    const res = await getMe("not-a-jwt");
    expect(res.status).toBe(401);
    expect(executeMock).not.toHaveBeenCalled();
  });

  it("rejects expired token with 401 without hitting the DB", async () => {
    const expired = await signToken({}, Math.floor(Date.now() / 1000) - 60);
    const res = await getMe(expired);
    expect(res.status).toBe(401);
    expect(executeMock).not.toHaveBeenCalled();
  });
});

describe("adminMiddleware — DB auth-state refresh", () => {
  it("rejects deleted user (no DB row) with 401", async () => {
    const res = await getMe(await signToken());
    expect(res.status).toBe(401);
    expect(executeMock).toHaveBeenCalledTimes(1);
  });

  it("rejects deactivated user with 401 even with a valid token", async () => {
    executeMock.mockResolvedValue({
      role: "cashier",
      is_active: false,
      can_process_pickup: false,
    });
    const res = await getMe(await signToken());
    expect(res.status).toBe(401);
  });

  it("passes active user through and looks up by token id", async () => {
    executeMock.mockResolvedValue({
      role: "cashier",
      is_active: true,
      can_process_pickup: false,
    });
    const res = await getMe(await signToken({ id: 42 }));
    expect(res.status).toBe(200);
    expect(executeMock).toHaveBeenCalledWith({ id: 42 });
  });

  it("overwrites stale token role/can_process_pickup with DB values", async () => {
    executeMock.mockResolvedValue({
      role: "worker",
      is_active: true,
      can_process_pickup: true,
    });
    const res = await getMe(
      await signToken({ role: "admin", can_process_pickup: false })
    );
    expect(res.status).toBe(200);
    const payload = (await res.json()) as JWTPayload;
    expect(payload.role).toBe("worker");
    expect(payload.can_process_pickup).toBe(true);
  });

  it("preserves identity fields from the token", async () => {
    executeMock.mockResolvedValue({
      role: "cashier",
      is_active: true,
      can_process_pickup: false,
    });
    const res = await getMe(
      await signToken({ id: 7, name: "Asep", username: "asep" })
    );
    const payload = (await res.json()) as JWTPayload;
    expect(payload.id).toBe(7);
    expect(payload.name).toBe("Asep");
    expect(payload.username).toBe("asep");
  });
});
