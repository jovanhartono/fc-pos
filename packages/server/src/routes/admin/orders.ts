import { Hono } from "hono";
import { StatusCodes } from "http-status-codes";
import { NotFoundException } from "@/errors";
import { GETOrdersQuerySchema } from "@/modules/orders/order.schema";
import { createOrder, listOrders } from "@/modules/orders/order.service";
import {
  GETMyOrderServicesQuerySchema,
  GETOrderByItemCodeQuerySchema,
  GETOrderServiceByIdQuerySchema,
  GETOrderServiceQueueQuerySchema,
  orderServiceParamSchema,
  PATCHOrderPaymentSchema,
  PATCHOrderServiceHandlerSchema,
  PATCHOrderServiceStatusSchema,
  POSTOrderIntakePhotoPresignSchema,
  POSTOrderRefundSchema,
  POSTOrderServicePhotoPresignSchema,
  POSTOrderServicePhotoSchema,
  PUTOrderIntakePhotoSchema,
} from "@/modules/orders/order-admin.schema";
import {
  completeOrderPickup,
  createOrderIntakePhotoPresign,
  createOrderRefund,
  createOrderServicePhotoPresign,
  getMyOrderServices,
  getOrderDetailById,
  getOrderServiceById,
  getOrderServiceByItemCode,
  getOrderServiceQueue,
  saveOrderIntakePhoto,
  saveOrderServicePhoto,
  startOrderServiceWork,
  updateOrderPayment,
  updateOrderServiceHandler,
  updateOrderServiceStatus,
} from "@/modules/orders/order-admin.service";
import { getStoreById } from "@/modules/stores/store.service";
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

    const { items, meta } = await listOrders(query, user);

    return c.json(success(items, undefined, meta));
  })
  .get(
    "/services/queue",
    zodValidator("query", GETOrderServiceQueueQuerySchema),
    async (c) => {
      const user = c.get("jwtPayload") as JWTPayload;
      const query = c.req.valid("query");

      const { items, meta } = await getOrderServiceQueue(user, query);

      return c.json(success(items, "Queue retrieved successfully", meta));
    }
  )
  .get(
    "/services/by-id",
    zodValidator("query", GETOrderServiceByIdQuerySchema),
    async (c) => {
      const user = c.get("jwtPayload") as JWTPayload;
      const { service_id } = c.req.valid("query");

      const orderService = await getOrderServiceById(service_id);

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

    const store = await getStoreById(body.store_id);
    if (!store) {
      throw new NotFoundException("Store not found");
    }

    const created = await createOrder(user.id, store, body);

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
  .post("/:id/complete", idParamSchema, async (c) => {
    const user = c.get("jwtPayload") as JWTPayload;
    const { id } = c.req.valid("param");

    await assertOrderAccess(user, id);

    const result = await completeOrderPickup({
      orderId: id,
      user,
    });

    return c.json(success(result, "Order pickup completed"));
  })
  .post(
    "/:id/services/:serviceId/start",
    orderServiceParamSchema,
    async (c) => {
      const user = c.get("jwtPayload") as JWTPayload;
      const { id, serviceId } = c.req.valid("param");

      await assertOrderAccess(user, id);

      const result = await startOrderServiceWork({
        orderId: id,
        serviceId,
        user,
      });

      return c.json(success(result, "Order service started"));
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
    "/:id/intake-photo/presign",
    idParamSchema,
    zodValidator("json", POSTOrderIntakePhotoPresignSchema),
    async (c) => {
      const user = c.get("jwtPayload") as JWTPayload;
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      await assertOrderAccess(user, id);

      const signed = await createOrderIntakePhotoPresign({
        orderId: id,
        body,
      });

      return c.json(
        success(signed, "Intake upload URL generated successfully")
      );
    }
  )
  .put(
    "/:id/intake-photo",
    idParamSchema,
    zodValidator("json", PUTOrderIntakePhotoSchema),
    async (c) => {
      const user = c.get("jwtPayload") as JWTPayload;
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      await assertOrderAccess(user, id);

      const photo = await saveOrderIntakePhoto({
        orderId: id,
        body,
        user,
      });

      return c.json(success(photo, "Order intake photo saved"));
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
