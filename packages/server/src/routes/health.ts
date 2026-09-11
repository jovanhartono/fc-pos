import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { StatusCodes } from "http-status-codes";
import { db } from "@/db";
import { failure, success } from "@/utils/http";

const app = new Hono().get("/", async (c) => {
  try {
    await db.execute(sql`select 1`);
    return c.json(success({ ok: true }));
  } catch (err) {
    console.error("health check failed", err);
    return c.json(
      failure("Database unavailable"),
      StatusCodes.SERVICE_UNAVAILABLE
    );
  }
});

export default app;
