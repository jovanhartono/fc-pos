import { asc } from "drizzle-orm";
import { Hono } from "hono";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";
import { db } from "@/db";
import { ordersTable } from "@/db/schema";
import { ForbiddenException, NotFoundException } from "@/errors";
import { createOrder } from "@/modules/orders/order.service";
import { findStoreById } from "@/modules/stores/store.repository";
import { findUserById } from "@/modules/users/user.repository";
import { POSTOrderSchema } from "@/schema";
import type { JWTPayload } from "@/types";
import { success } from "@/utils/http";
import { zodValidator } from "@/utils/zod-validator-wrapper";

export const DEFAULT_LIMIT = 25;
export const DEFAULT_OFFSET = 0;

const GETOrdersQuerySchema = z
  .object({
    limit: z.coerce.number().default(DEFAULT_LIMIT).optional(),
    offset: z.coerce.number().default(DEFAULT_OFFSET).optional(),
  })
  .optional();

const app = new Hono()
  .get("/", zodValidator("query", GETOrdersQuerySchema), async (c) => {
    const query = c.req.valid("query") || {};
    const { limit, offset } = query;

    const orders = await db.query.ordersTable.findMany({
      orderBy: [asc(ordersTable.id)],
      limit,
      offset,
    });

    return c.json(success(orders));
  })
  .post("/", zodValidator("json", POSTOrderSchema), async (c) => {
    const { id: user_id } = c.get("jwtPayload") as JWTPayload;

    const user = await findUserById(user_id);

    if (!user) {
      throw new NotFoundException("User not found");
    }

    if (!user.is_active) {
      throw new ForbiddenException("User is not active");
    }

    const body = c.req.valid("json");
    const store = await findStoreById(body.store_id);

    if (!store) {
      throw new NotFoundException("Store not found");
    }

    await createOrder(user, store, body);

    return c.json(success("Order Created"), StatusCodes.CREATED);
  });

export default app;
