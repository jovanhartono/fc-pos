import { asc, eq } from "drizzle-orm";
import { createInsertSchema, createUpdateSchema } from "drizzle-zod";
import { Hono } from "hono";
import { StatusCodes } from "http-status-codes";
import { db } from "@/db";
import { servicesTable } from "@/db/schema";
import { notFoundOrFirst } from "@/utils/helper";
import { failure, success } from "@/utils/http";
import { idParamSchema } from "@/utils/schema";
import { zodValidator } from "@/utils/zod-validator-wrapper";

const POSTServiceSchema = createInsertSchema(servicesTable);
const PUTServiceSchema = createUpdateSchema(servicesTable);
const app = new Hono()
  .get("/", async (c) => {
    const services = await db.query.servicesTable.findMany({
      orderBy: [asc(servicesTable.id)],
      with: {
        category: true,
      },
    });

    return c.json(success(services));
  })
  .get("/:id", idParamSchema, async (c) => {
    const { id } = c.req.valid("param");

    const service = await db.query.servicesTable.findFirst({
      where: eq(servicesTable.id, id),
    });

    if (!service) {
      return c.json(failure("Service not found", StatusCodes.NOT_FOUND));
    }

    return c.json(success(service, "Service retrieved successfully"));
  })
  .post("/", zodValidator("json", POSTServiceSchema), async (c) => {
    const body = c.req.valid("json");

    const [service] = await db.insert(servicesTable).values(body).returning();

    return c.json(
      success(service, "Create service success"),
      StatusCodes.CREATED
    );
  })
  .put(
    "/:id",
    idParamSchema,
    zodValidator("json", PUTServiceSchema),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      const updatedService = await db
        .update(servicesTable)
        .set(body)
        .where(eq(servicesTable.id, id))
        .returning();

      const service = notFoundOrFirst(
        updatedService,
        c,
        "Service does not exist"
      );
      if (service instanceof Response) {
        return service;
      }

      return c.json(success(service, `Update service ${service.code} success`));
    }
  );

export default app;
