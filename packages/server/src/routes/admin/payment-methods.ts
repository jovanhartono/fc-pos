import { Hono } from "hono";
import { StatusCodes } from "http-status-codes";
import {
  GETPaymentMethodsQuerySchema,
  POSTPaymentMethodSchema,
  PUTPaymentMethodSchema,
} from "@/modules/payment-methods/payment-method.schema";
import {
  createPaymentMethod,
  getPaymentMethodById,
  getPaymentMethods,
  updatePaymentMethod,
} from "@/modules/payment-methods/payment-method.service";
import { idParamSchema } from "@/schema/param";
import { failure, success } from "@/utils/http";
import { zodValidator } from "@/utils/zod-validator-wrapper";

const app = new Hono()
  .get("/", zodValidator("query", GETPaymentMethodsQuerySchema), async (c) => {
    const query = c.req.valid("query");
    const paymentMethods = await getPaymentMethods(query);

    return c.json(success(paymentMethods));
  })
  .get("/:id", idParamSchema, async (c) => {
    const { id } = c.req.valid("param");

    const paymentMethod = await getPaymentMethodById(id);

    if (!paymentMethod) {
      return c.json(failure("Payment Method not found"), StatusCodes.NOT_FOUND);
    }

    return c.json(
      success(paymentMethod, "Payment Method retrieved successfully")
    );
  })
  .post("/", zodValidator("json", POSTPaymentMethodSchema), async (c) => {
    const body = c.req.valid("json");

    const paymentMethod = await createPaymentMethod(body);

    return c.json(
      success(paymentMethod, "Create payment method success"),
      StatusCodes.CREATED
    );
  })
  .put(
    "/:id",
    idParamSchema,
    zodValidator("json", PUTPaymentMethodSchema),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      const paymentMethod = await updatePaymentMethod(id, body);

      if (!paymentMethod) {
        return c.json(
          failure("Payment method does not exist"),
          StatusCodes.NOT_FOUND
        );
      }

      return c.json(
        success(
          paymentMethod,
          `Update payment method ${paymentMethod.name} success`
        )
      );
    }
  );

export default app;
