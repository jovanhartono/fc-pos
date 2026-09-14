import { Hono } from "hono";
import { z } from "zod";
import { getTrackedOrder } from "@/modules/orders/order-track.service";
import { phoneSchema } from "@/schema/common";
import { success } from "@/utils/http";
import { zodValidator } from "@/utils/zod-validator-wrapper";

const POSTPublicTrackOrderSchema = z.object({
  code: z.string().trim().min(1).max(32),
  phone_number: phoneSchema,
});

const app = new Hono().post(
  "/track",
  zodValidator("json", POSTPublicTrackOrderSchema),
  async (c) => c.json(success(await getTrackedOrder(c.req.valid("json"))))
);

export default app;
