import { Hono } from "hono";
import { StatusCodes } from "http-status-codes";
import {
  createOrderController,
  getOrdersController,
} from "@/modules/orders/order.controller";
import { GETOrdersQuerySchema } from "@/modules/orders/order.schema";
import {
  GETMyOrderServicesQuerySchema,
  GETOrderByItemCodeQuerySchema,
  orderServiceParamSchema,
  PATCHOrderPaymentSchema,
  PATCHOrderServiceHandlerSchema,
  PATCHOrderServiceStatusSchema,
  POSTOrderRefundSchema,
  POSTOrderServicePhotoPresignSchema,
  POSTOrderServicePhotoSchema,
} from "@/modules/orders/order-admin.schema";
import {
  claimOrderService,
  createOrderRefund,
  createOrderServicePhotoPresign,
  getMyOrderServices,
  getOrderDetailById,
  getOrderServiceByItemCode,
  saveOrderServicePhoto,
  updateOrderPayment,
  updateOrderServiceHandler,
  updateOrderServiceStatus,
} from "@/modules/orders/order-admin.service";
import { POSTOrderSchema } from "@/schema";
import { idParamSchema } from "@/schema/param";
import type { JWTPayload } from "@/types";
import { assertOrderAccess, assertStoreAccess } from "@/utils/authorization";
import { failure, success } from "@/utils/http";
import { zodValidator } from "@/utils/zod-validator-wrapper";

const app = new Hono()
  .get("/", zodValidator("query", GETOrdersQuerySchema), async (c) => {
    const query = c.req.valid("query");
    const user = c.get("jwtPayload") as JWTPayload;

    const { items, meta } = await getOrdersController({ query, user });

    return c.json(success(items, undefined, meta));
  })
  .get(
    "/services/by-item-code",
    zodValidator("query", GETOrderByItemCodeQuerySchema),
    async (c) => {
      const user = c.get("jwtPayload") as JWTPayload;
      const { item_code } = c.req.valid("query");

      const orderService = await getOrderServiceByItemCode(item_code);

      if (!orderService?.order) {
        return c.json(
          failure("Order service not found"),
          StatusCodes.NOT_FOUND
        );
      }

      await assertStoreAccess(user, orderService.order.store_id);

      return c.json(
        success(orderService, "Order service retrieved successfully")
      );
    }
  )
  .get(
    "/services/me",
    zodValidator("query", GETMyOrderServicesQuerySchema),
    async (c) => {
      const user = c.get("jwtPayload") as JWTPayload;
      const query = c.req.valid("query");

      const rows = await getMyOrderServices(user, query);

      return c.json(success(rows, "My order services retrieved successfully"));
    }
  )
  .post("/", zodValidator("json", POSTOrderSchema), async (c) => {
    const user = c.get("jwtPayload") as JWTPayload;
    const body = c.req.valid("json");

    await assertStoreAccess(user, body.store_id);

    const created = await createOrderController({
      userId: user.id,
      body,
    });

    return c.json(success(created, "Order created"), StatusCodes.CREATED);
  })
  .get("/:id", idParamSchema, async (c) => {
    const user = c.get("jwtPayload") as JWTPayload;
    const { id } = c.req.valid("param");

    await assertOrderAccess(user, id);

    const detail = await getOrderDetailById(id);

    if (!detail) {
      return c.json(failure("Order not found"), StatusCodes.NOT_FOUND);
    }

    return c.json(success(detail, "Order detail retrieved successfully"));
  })
  .patch(
    "/:id/payment",
    idParamSchema,
    zodValidator("json", PATCHOrderPaymentSchema),
    async (c) => {
      const user = c.get("jwtPayload") as JWTPayload;
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      await assertOrderAccess(user, id);

      const payment = await updateOrderPayment({
        orderId: id,
        body,
        user,
      });

      if (!payment) {
        return c.json(failure("Order not found"), StatusCodes.NOT_FOUND);
      }

      return c.json(success(payment, "Payment updated successfully"));
    }
  )
  .post(
    "/:id/services/:serviceId/claim",
    orderServiceParamSchema,
    async (c) => {
      const user = c.get("jwtPayload") as JWTPayload;
      const { id, serviceId } = c.req.valid("param");

      await assertOrderAccess(user, id);

      const result = await claimOrderService({
        orderId: id,
        serviceId,
        user,
      });

      return c.json(success(result, "Order service claimed"));
    }
  )
  .patch(
    "/:id/services/:serviceId/handler",
    orderServiceParamSchema,
    zodValidator("json", PATCHOrderServiceHandlerSchema),
    async (c) => {
      const user = c.get("jwtPayload") as JWTPayload;
      const { id, serviceId } = c.req.valid("param");
      const body = c.req.valid("json");

      await assertOrderAccess(user, id);

      const result = await updateOrderServiceHandler({
        orderId: id,
        serviceId,
        body,
        user,
      });

      return c.json(success(result, "Order service handler updated"));
    }
  )
  .patch(
    "/:id/services/:serviceId/status",
    orderServiceParamSchema,
    zodValidator("json", PATCHOrderServiceStatusSchema),
    async (c) => {
      const user = c.get("jwtPayload") as JWTPayload;
      const { id, serviceId } = c.req.valid("param");
      const body = c.req.valid("json");

      await assertOrderAccess(user, id);

      const result = await updateOrderServiceStatus({
        orderId: id,
        serviceId,
        body,
        user,
      });

      return c.json(success(result, "Order service status updated"));
    }
  )
  .post(
    "/:id/services/:serviceId/photos/presign",
    orderServiceParamSchema,
    zodValidator("json", POSTOrderServicePhotoPresignSchema),
    async (c) => {
      const user = c.get("jwtPayload") as JWTPayload;
      const { id, serviceId } = c.req.valid("param");
      const body = c.req.valid("json");

      await assertOrderAccess(user, id);

      const signed = await createOrderServicePhotoPresign({
        orderId: id,
        serviceId,
        body,
      });

      return c.json(success(signed, "Upload URL generated successfully"));
    }
  )
  .post(
    "/:id/services/:serviceId/photos",
    orderServiceParamSchema,
    zodValidator("json", POSTOrderServicePhotoSchema),
    async (c) => {
      const user = c.get("jwtPayload") as JWTPayload;
      const { id, serviceId } = c.req.valid("param");
      const body = c.req.valid("json");

      await assertOrderAccess(user, id);

      const photo = await saveOrderServicePhoto({
        orderId: id,
        serviceId,
        body,
        user,
      });

      return c.json(success(photo, "Photo saved"), StatusCodes.CREATED);
    }
  )
  .post(
    "/:id/refunds",
    idParamSchema,
    zodValidator("json", POSTOrderRefundSchema),
    async (c) => {
      const user = c.get("jwtPayload") as JWTPayload;
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      await assertOrderAccess(user, id);

      const result = await createOrderRefund({
        orderId: id,
        body,
        user,
      });

      return c.json(
        success(result, "Order refund processed"),
        StatusCodes.CREATED
      );
    }
  );

export default app;
