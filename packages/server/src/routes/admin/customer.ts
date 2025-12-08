import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { StatusCodes } from "http-status-codes";
import { db } from "@/db";
import { customersTable } from "@/db/schema";
import { POSTCustomerSchema, PUTCustomerSchema } from "@/schema";
import { idParamSchema } from "@/schema/param";
import type { JWTPayload } from "@/types";
import { failure, success } from "@/utils/http";
import { zodValidator } from "@/utils/zod-validator-wrapper";

const app = new Hono()
  .get("/", async (c) => {
    const customers = await db.query.customersTable.findMany({
      orderBy: [asc(customersTable.id)],
      with: {
        originStore: {
          columns: {
            name: true,
          },
        },
      },
    });

    return c.json(success(customers));
  })
  .post("/", zodValidator("json", POSTCustomerSchema), async (c) => {
    const { id: user_id } = c.get("jwtPayload") as JWTPayload;
    const customer = c.req.valid("json");

    const data = await db
      .insert(customersTable)
      .values({
        ...customer,
        created_by: user_id,
        updated_by: user_id,
      })
      .returning();

    return c.json(
      success(data, "Create customer success"),
      StatusCodes.CREATED
    );
  })
  .get("/:id", idParamSchema, async (c) => {
    const { id } = c.req.valid("param");

    const customer = await db.query.customersTable.findFirst({
      where: eq(customersTable.id, id),
      with: {
        originStore: true,
      },
    });

    if (!customer) {
      return c.json(failure("Customer not found", StatusCodes.NOT_FOUND));
    }

    return c.json(success(customer, "Customer retrieved successfully"));
  })
  .put(
    "/:id",
    idParamSchema,
    zodValidator("json", PUTCustomerSchema),
    async (c) => {
      const { id: user_id } = c.get("jwtPayload") as JWTPayload;
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      const [customer] = await db
        .update(customersTable)
        .set({
          ...body,
          updated_by: user_id,
        })
        .where(eq(customersTable.id, id))
        .returning();

      return c.json(
        success(customer, `Update customer ${customer.name} success`)
      );
    }
  );

export default app;
