import { Hono } from "hono";
import { StatusCodes } from "http-status-codes";
import {
  GETCustomersQuerySchema,
  POSTCustomerSchema,
  PUTCustomerSchema,
} from "@/modules/customers/customer.schema";
import {
  createCustomer,
  getCustomerById,
  getCustomers,
  updateCustomer,
} from "@/modules/customers/customer.service";
import { idParamSchema } from "@/schema/param";
import type { JWTPayload } from "@/types";
import { failure, success } from "@/utils/http";
import { zodValidator } from "@/utils/zod-validator-wrapper";

const app = new Hono()
  .get("/", zodValidator("query", GETCustomersQuerySchema), async (c) => {
    const query = c.req.valid("query");
    const { items, meta } = await getCustomers(query);

    return c.json(success(items, undefined, meta));
  })
  .post("/", zodValidator("json", POSTCustomerSchema), async (c) => {
    const { id: user_id } = c.get("jwtPayload") as JWTPayload;
    const payload = c.req.valid("json");

    const { customer, existed } = await createCustomer({
      actorId: user_id,
      payload,
    });

    return c.json(
      success(
        customer,
        existed ? "Customer already exists" : "Create customer success"
      ),
      existed ? StatusCodes.OK : StatusCodes.CREATED
    );
  })
  .get("/:id", idParamSchema, async (c) => {
    const { id } = c.req.valid("param");

    const customer = await getCustomerById(id);

    if (!customer) {
      return c.json(failure("Customer not found"), StatusCodes.NOT_FOUND);
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

      const customer = await updateCustomer({
        id,
        actorId: user_id,
        payload: body,
      });

      if (!customer) {
        return c.json(
          failure("Customer does not exist"),
          StatusCodes.NOT_FOUND
        );
      }

      return c.json(
        success(customer, `Update customer ${customer.name} success`)
      );
    }
  );

export default app;
