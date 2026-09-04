import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";
import { NotFoundException } from "@/http-exceptions";
import { GETOrdersQuerySchema } from "@/modules/orders/order.schema";
import {
  createOrder,
  getOrderDetailById,
  listOrders,
} from "@/modules/orders/order.service";
import {
  GETMyOrderServicesQuerySchema,
  GETOrderByItemCodeQuerySchema,
  GETOrderServiceByIdQuerySchema,
  GETOrderServiceQueueCountsQuerySchema,
  GETOrderServiceQueueQuerySchema,
  orderItemParamSchema,
  orderItemPhotoParamSchema,
  orderServiceParamSchema,
  PATCHOrderCourierSchema,
  PATCHOrderPaymentSchema,
  PATCHOrderServiceHandlerSchema,
  PATCHOrderServicePriceSchema,
  PATCHOrderServiceStatusSchema,
  POSTItemPhotoPresignSchema,
  POSTItemPhotoSchema,
  POSTOrderCancelSchema,
  POSTOrderDropoffPhotoPresignSchema,
  POSTOrderPickupEventPresignSchema,
  POSTOrderPickupEventSchema,
  POSTOrderRefundSchema,
  PUTOrderDropoffPhotoSchema,
} from "@/modules/orders/order-admin.schema";
import { updateOrderCollectedBy } from "@/modules/orders/order-courier.service";
import { updateOrderPayment } from "@/modules/orders/order-payment.service";
import {
  createItemPhotoPresign,
  createOrderDropoffPhotoPresign,
  deleteItemPhoto,
  saveItemPhoto,
  saveOrderDropoffPhoto,
} from "@/modules/orders/order-photo.service";
import {
  createOrderPickupEvent,
  createOrderPickupEventPresign,
} from "@/modules/orders/order-pickup.service";
import { setOrderServicePrice } from "@/modules/orders/order-price.service";
import {
  getItemByItemCode,
  getMyOrderServices,
  getOrderServiceById,
  getOrderServiceQueue,
  getOrderServiceQueueCounts,
  startOrderServiceWork,
  updateOrderServiceHandler,
  updateOrderServiceStatus,
} from "@/modules/orders/order-queue.service";
import { getOrderReceiptById } from "@/modules/orders/order-receipt.service";
import {
  cancelOrder,
  createOrderRefund,
} from "@/modules/orders/order-reversal.service";
import { assertCanCreateOrder } from "@/modules/permissions/permissions";
import { getStoreById } from "@/modules/stores/store.service";
import { POSTOrderSchema } from "@/schema";
import { idParamSchema } from "@/schema/param";
import type { AdminEnv } from "@/types/hono";
import { assertOrderAccess, assertStoreAccess } from "@/utils/authorization";
import { success } from "@/utils/http";
import { zodValidator } from "@/utils/zod-validator-wrapper";

interface OrderAccessEnv {
  Variables: AdminEnv["Variables"] & {
    order?: Awaited<ReturnType<typeof assertOrderAccess>>;
  };
}

// The id is read the way the handlers below validate it, not as plain digits.
// /orders/+123 and /orders/%20123 both reach a handler as order 123, so a gate
// that recognised only digits would wave them through unchecked.
const orderIdParam = z.coerce.number().int().positive();

// Every screen that opens a single order — the ticket, its receipt, its photos,
// its refund — has to prove the person works at that branch: a cashier at Kemang
// can never open a Bintaro order. One gate covers all of them, because the way
// this leaks is a new /orders/:id screen whose author forgot line one.
//
// A path that is not an order id passes through untouched: the workshop queue at
// /orders/services/queue is not order "services", and does its own branch check.
const requireOrderAccess = createMiddleware<OrderAccessEnv>(async (c, next) => {
  const orderId = orderIdParam.safeParse(c.req.param("id"));

  if (orderId.success && !c.get("order")) {
    const order = await assertOrderAccess(c.get("jwtPayload"), orderId.data);
    c.set("order", order);
  }

  await next();
});

const app = new Hono<OrderAccessEnv>()
  // Both shapes, because which one matches a bare /orders/123 depends on the
  // router Hono picks for the whole API. Whichever fires first files the order
  // and the other steps aside, so the branch is looked up once.
  .use("/:id", requireOrderAccess)
  .use("/:id/*", requireOrderAccess)
  .get("/", zodValidator("query", GETOrdersQuerySchema), async (c) => {
    const query = c.req.valid("query");
    const user = c.get("jwtPayload");

    const { items, meta } = await listOrders(query, user);

    return c.json(success(items, undefined, meta));
  })
  .get(
    "/services/queue",
    zodValidator("query", GETOrderServiceQueueQuerySchema),
    async (c) => {
      const user = c.get("jwtPayload");
      const query = c.req.valid("query");

      const { items, meta } = await getOrderServiceQueue(user, query);

      return c.json(success(items, "Queue retrieved successfully", meta));
    }
  )
  .get(
    "/services/queue/counts",
    zodValidator("query", GETOrderServiceQueueCountsQuerySchema),
    async (c) => {
      const user = c.get("jwtPayload");
      const query = c.req.valid("query");

      return c.json(success(await getOrderServiceQueueCounts(user, query)));
    }
  )
  .get(
    "/services/by-id",
    zodValidator("query", GETOrderServiceByIdQuerySchema),
    async (c) => {
      const user = c.get("jwtPayload");
      const { service_id } = c.req.valid("query");

      const orderService = await getOrderServiceById(service_id);

      if (!orderService?.order) {
        throw new NotFoundException("Order service not found");
      }

      await assertStoreAccess(user, orderService.order.store_id);

      return c.json(
        success(orderService, "Order service retrieved successfully")
      );
    }
  )
  // A scanned tag names an object, not a job (ADR-0017). The Item comes back
  // with the treatments still open on it, so the caller can send a worker
  // straight to the only one outstanding or let them pick.
  .get(
    "/items/by-item-code",
    zodValidator("query", GETOrderByItemCodeQuerySchema),
    async (c) => {
      const user = c.get("jwtPayload");
      const { item_code } = c.req.valid("query");

      const item = await getItemByItemCode(item_code);

      if (!item?.order) {
        throw new NotFoundException("Item not found");
      }

      await assertStoreAccess(user, item.order.store_id);

      return c.json(success(item, "Item retrieved successfully"));
    }
  )
  .get(
    "/services/me",
    zodValidator("query", GETMyOrderServicesQuerySchema),
    async (c) => {
      const user = c.get("jwtPayload");
      const query = c.req.valid("query");

      const rows = await getMyOrderServices(user, query);

      return c.json(success(rows, "My order services retrieved successfully"));
    }
  )
  .post("/", zodValidator("json", POSTOrderSchema), async (c) => {
    const user = c.get("jwtPayload");
    assertCanCreateOrder(user);

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
    const { id } = c.req.valid("param");

    const detail = await getOrderDetailById(id);

    if (!detail) {
      throw new NotFoundException("Order not found");
    }

    return c.json(success(detail, "Order detail retrieved successfully"));
  })
  .get("/:id/receipt", idParamSchema, async (c) => {
    const { id } = c.req.valid("param");

    const receipt = await getOrderReceiptById(id);

    if (!receipt) {
      throw new NotFoundException("Order not found");
    }

    return c.json(success(receipt, "Order receipt retrieved successfully"));
  })
  .patch(
    "/:id/payment",
    idParamSchema,
    zodValidator("json", PATCHOrderPaymentSchema),
    async (c) => {
      const user = c.get("jwtPayload");
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      const payment = await updateOrderPayment({
        orderId: id,
        body,
        user,
      });

      if (!payment) {
        throw new NotFoundException("Order not found");
      }

      return c.json(success(payment, "Payment updated successfully"));
    }
  )
  .patch(
    "/:id/courier",
    idParamSchema,
    zodValidator("json", PATCHOrderCourierSchema),
    async (c) => {
      const user = c.get("jwtPayload");
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      const updated = await updateOrderCollectedBy({
        orderId: id,
        collectedBy: body.collected_by,
        user,
      });

      if (!updated) {
        throw new NotFoundException("Order not found");
      }

      return c.json(success(updated, "Courier updated successfully"));
    }
  )
  .post(
    "/:id/pickup-events/presign",
    idParamSchema,
    zodValidator("json", POSTOrderPickupEventPresignSchema),
    async (c) => {
      const user = c.get("jwtPayload");
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      const signed = await createOrderPickupEventPresign({
        orderId: id,
        body,
        user,
      });

      return c.json(
        success(signed, "Pickup upload URL generated successfully")
      );
    }
  )
  .post(
    "/:id/pickup-events",
    idParamSchema,
    zodValidator("json", POSTOrderPickupEventSchema),
    async (c) => {
      const user = c.get("jwtPayload");
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      const result = await createOrderPickupEvent({
        orderId: id,
        body,
        user,
      });

      return c.json(
        success(result, "Order pickup recorded"),
        StatusCodes.CREATED
      );
    }
  )
  .post(
    "/:id/services/:serviceId/start",
    orderServiceParamSchema,
    async (c) => {
      const user = c.get("jwtPayload");
      const { id, serviceId } = c.req.valid("param");

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
      const user = c.get("jwtPayload");
      const { id, serviceId } = c.req.valid("param");
      const body = c.req.valid("json");

      const result = await updateOrderServiceHandler({
        orderId: id,
        serviceId,
        body,
        user,
      });

      return c.json(success(result, "Order service handler updated"));
    }
  )
  // Open to any staff — deliberately NOT behind the admin money gate
  // (ADR-0018 / ADR-0004). Who set what price is in order_service_price_logs.
  .patch(
    "/:id/services/:serviceId/price",
    orderServiceParamSchema,
    zodValidator("json", PATCHOrderServicePriceSchema),
    async (c) => {
      const user = c.get("jwtPayload");
      const { id, serviceId } = c.req.valid("param");
      const body = c.req.valid("json");

      const result = await setOrderServicePrice({
        orderId: id,
        serviceId,
        body,
        user,
      });

      return c.json(success(result, "Price updated"));
    }
  )
  .patch(
    "/:id/services/:serviceId/status",
    orderServiceParamSchema,
    zodValidator("json", PATCHOrderServiceStatusSchema),
    async (c) => {
      const user = c.get("jwtPayload");
      const { id, serviceId } = c.req.valid("param");
      const body = c.req.valid("json");

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
    "/:id/items/:itemId/photos/presign",
    orderItemParamSchema,
    zodValidator("json", POSTItemPhotoPresignSchema),
    async (c) => {
      const { id, itemId } = c.req.valid("param");
      const body = c.req.valid("json");

      const signed = await createItemPhotoPresign({
        orderId: id,
        itemId,
        body,
      });

      return c.json(success(signed, "Upload URL generated successfully"));
    }
  )
  .post(
    "/:id/dropoff-photo/presign",
    idParamSchema,
    zodValidator("json", POSTOrderDropoffPhotoPresignSchema),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      const signed = await createOrderDropoffPhotoPresign({
        orderId: id,
        body,
      });

      return c.json(
        success(signed, "Drop-off upload URL generated successfully")
      );
    }
  )
  .put(
    "/:id/dropoff-photo",
    idParamSchema,
    zodValidator("json", PUTOrderDropoffPhotoSchema),
    async (c) => {
      const user = c.get("jwtPayload");
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      const photo = await saveOrderDropoffPhoto({
        orderId: id,
        body,
        user,
      });

      return c.json(success(photo, "Order drop-off photo saved"));
    }
  )
  .post(
    "/:id/items/:itemId/photos",
    orderItemParamSchema,
    zodValidator("json", POSTItemPhotoSchema),
    async (c) => {
      const user = c.get("jwtPayload");
      const { id, itemId } = c.req.valid("param");
      const body = c.req.valid("json");

      const photo = await saveItemPhoto({
        orderId: id,
        itemId,
        body,
        user,
      });

      return c.json(success(photo, "Photo saved"), StatusCodes.CREATED);
    }
  )
  .delete(
    "/:id/items/:itemId/photos/:photoId",
    orderItemPhotoParamSchema,
    async (c) => {
      const user = c.get("jwtPayload");
      const { id, itemId, photoId } = c.req.valid("param");

      const result = await deleteItemPhoto({
        orderId: id,
        itemId,
        photoId,
        user,
      });

      return c.json(success(result, "Photo deleted"));
    }
  )
  .post(
    "/:id/refunds",
    idParamSchema,
    zodValidator("json", POSTOrderRefundSchema),
    async (c) => {
      const user = c.get("jwtPayload");
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

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
  )
  .post(
    "/:id/cancel",
    idParamSchema,
    zodValidator("json", POSTOrderCancelSchema),
    async (c) => {
      const user = c.get("jwtPayload");
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      const result = await cancelOrder({
        orderId: id,
        body,
        user,
      });

      return c.json(success(result, "Order cancelled"));
    }
  );

export default app;
