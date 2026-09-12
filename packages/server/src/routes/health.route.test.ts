import { describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";

const executeMock = mock((): Promise<unknown> => Promise.resolve());

mock.module("@/db", () => ({
  db: { execute: executeMock },
}));

const healthRoutes = (await import("@/routes/health")).default;

const app = new Hono().route("/health", healthRoutes);

describe("GET /health", () => {
  it("answers 200 when the database responds", async () => {
    executeMock.mockResolvedValue(undefined);

    const res = await app.request("/health");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: { ok: true },
      success: true,
    });
  });

  it("answers 503 when the database is unreachable", async () => {
    // Vercel's cron and uptime checks hit this route to decide whether the
    // container is healthy — a dropped Neon connection must fail loud, not 200.
    executeMock.mockImplementation(() =>
      Promise.reject(new Error("connection refused"))
    );

    const res = await app.request("/health");

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      message: "Database unavailable",
      success: false,
    });
  });
});
