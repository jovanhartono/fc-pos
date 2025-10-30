import { asc } from "drizzle-orm";
import { Hono } from "hono";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";
import { db } from "@/db";
import { ordersTable } from "@/db/schema";
import { success } from "@/utils/http";
import { POSTOrderSchema } from "@/schema";
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
    const body = c.req.valid("json");

    // auto-generate code based on store

    const order = await db
      .insert(ordersTable)
      .values({
        ...body,
      })
      .returning();

    return c.json(success(order, "Order Created"), StatusCodes.CREATED);
  });

export default app;
