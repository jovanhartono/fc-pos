import { Hono } from "hono";
import { StatusCodes } from "http-status-codes";
import {
  GETShiftsQuerySchema,
  PATCHShiftSchema,
  POSTClockInSchema,
} from "@/modules/shifts/shift.schema";
import {
  clockIn,
  clockOut,
  getCurrentShift,
  getShifts,
  updateShift,
} from "@/modules/shifts/shift.service";
import { idParamSchema } from "@/schema/param";
import type { AdminEnv } from "@/types/hono";
import { success } from "@/utils/http";
import { zodValidator } from "@/utils/zod-validator-wrapper";

const app = new Hono<AdminEnv>()
  .get("/", zodValidator("query", GETShiftsQuerySchema), async (c) => {
    const user = c.get("jwtPayload");
    const query = c.req.valid("query");

    const { items, meta } = await getShifts(user, query);

    return c.json(success(items, undefined, meta));
  })
  .get("/current", async (c) => {
    const user = c.get("jwtPayload");
    const shift = await getCurrentShift(user);
    return c.json(success(shift ?? null));
  })
  .post("/clock-in", zodValidator("json", POSTClockInSchema), async (c) => {
    const user = c.get("jwtPayload");
    const body = c.req.valid("json");

    const { shift, message } = await clockIn({
      user,
      storeId: body.store_id,
      coordinates: body.coordinates,
    });

    return c.json(success(shift, message), StatusCodes.CREATED);
  })
  .post("/clock-out", async (c) => {
    const user = c.get("jwtPayload");
    const { shift, message } = await clockOut(user);
    return c.json(success(shift, message));
  })
  .patch(
    "/:id",
    idParamSchema,
    zodValidator("json", PATCHShiftSchema),
    async (c) => {
      const user = c.get("jwtPayload");
      const shift = await updateShift({
        user,
        shiftId: c.req.valid("param").id,
        body: c.req.valid("json"),
      });
      return c.json(success(shift, "Shift updated"));
    }
  );

export default app;
