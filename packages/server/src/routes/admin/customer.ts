import { eq } from "drizzle-orm";
import { createInsertSchema, createUpdateSchema } from "drizzle-zod";
import { Hono } from "hono";
import { StatusCodes } from "http-status-codes";
import { db } from "@/db";
import { customersTable } from "@/db/schema";
import { failure, success } from "@/utils/http";
import { idParamSchema } from "@/utils/schema";
import { zodValidator } from "@/utils/zod-validator-wrapper";

const POSTCustomerSchema = createInsertSchema(customersTable);
const PUTCustomerSchema = createUpdateSchema(customersTable);
const app = new Hono()
  .post("/", zodValidator("json", POSTCustomerSchema), async (c) => {
    const customer = c.req.valid("json");

    const data = await db.insert(customersTable).values(customer).returning();

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
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      const [customer] = await db
        .update(customersTable)
        .set(body)
        .where(eq(customersTable.id, id))
        .returning();

      return c.json(
        success(customer, `Update customer ${customer.name} success`)
      );
    }
  );

export default app;
