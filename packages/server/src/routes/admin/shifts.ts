import { Hono } from "hono";
import { StatusCodes } from "http-status-codes";
import {
  GETShiftsQuerySchema,
  POSTClockInSchema,
} from "@/modules/shifts/shift.schema";
import {
  clockIn,
  clockOut,
  getCurrentShift,
  getShifts,
} from "@/modules/shifts/shift.service";
import type { JWTPayload } from "@/types";
import { success } from "@/utils/http";
import { zodValidator } from "@/utils/zod-validator-wrapper";

const app = new Hono()
  .get("/", zodValidator("query", GETShiftsQuerySchema), async (c) => {
    const user = c.get("jwtPayload") as JWTPayload;
    const query = c.req.valid("query");

    const items = await getShifts(user, query);

    return c.json(success(items));
  })
  .get("/current", async (c) => {
    const user = c.get("jwtPayload") as JWTPayload;
    const shift = await getCurrentShift(user);
    return c.json(success(shift ?? null));
  })
  .post("/clock-in", zodValidator("json", POSTClockInSchema), async (c) => {
    const user = c.get("jwtPayload") as JWTPayload;
    const body = c.req.valid("json");

    const shift = await clockIn({ user, storeId: body.store_id });

    return c.json(
      success(shift, "Clocked in successfully"),
      StatusCodes.CREATED
    );
  })
  .post("/clock-out", async (c) => {
    const user = c.get("jwtPayload") as JWTPayload;
    const shift = await clockOut(user);
    return c.json(success(shift, "Clocked out successfully"));
  });

export default app;
