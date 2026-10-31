import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";
import { NotFoundException } from "@/http-exceptions";
import { GETOrdersQuerySchema } from "@/modules/orders/order.schema";
import {
  createOrder,
  getOrderDetailById,
  getOrderStatusCounts,
  listOrders,
} from "@/modules/orders/order.service";
import {
  GETMyOrderServicesQuerySchema,
  GETOrderLookupQuerySchema,
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
import { resolveOrderLookup } from "@/modules/orders/order-lookup.service";
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
import { createOrderPickupNotice } from "@/modules/orders/order-pickup-notice.service";
import { setOrderServicePrice } from "@/modules/orders/order-price.service";
import {
  getMyOrderServices,
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
import { getOrderServiceDetail } from "@/modules/orders/order-service-detail.service";
import {
  POSTPaymentChargeSchema,
  paymentChargeParamSchema,
} from "@/modules/payments/payment-charge.schema";
import {
  cancelOrderPendingCharges,
  cancelPaymentCharge,
  createPaymentCharge,
  getOpenQrisCharge,
  getPaymentCharge,
} from "@/modules/payments/payment-charge.service";
import {
  assertCanCreateOrder,
  assertCanProcessPayment,
} from "@/modules/permissions/permissions";
import { getStoreById } from "@/modules/stores/store.service";
import { POSTOrderSchema } from "@/schema";
import { idParamSchema } from "@/schema/param";
import type { AdminEnv } from "@/types/hono";
import { assertOrderAccess, assertStoreAccess } from "@/utils/authorization";
import { success } from "@/utils/http";
import { zodValidator } from "@/utils/zod-validator-wrapper";

interface OrderAccessEnv {
  Variables: AdminEnv["Variables"] & {
    orderAccessChecked?: boolean;
  };
}

// Read the way the handlers validate it: /orders/+123 and /orders/%20123 both
// reach a handler as Order 123, and a digits-only gate would wave them through.
const orderIdParam = z.coerce.number().int().positive();

// A cashier at Kemang must never open a Bintaro Order. One gate for every
// /orders/:id screen, so a new one cannot forget the check. Paths that are not an
// Order id, such as /orders/services/queue, pass through and check the Store themselves.
const requireOrderAccess = createMiddleware<OrderAccessEnv>(async (c, next) => {
  const orderId = orderIdParam.safeParse(c.req.param("id"));

  if (orderId.success && !c.get("orderAccessChecked")) {
    await assertOrderAccess(c.get("jwtPayload"), orderId.data);
    c.set("orderAccessChecked", true);
  }

  await next();
});

const app = new Hono<OrderAccessEnv>()
  // Both shapes, because which one matches a bare /orders/123 depends on the
  // router Hono picks for the whole API. Whichever fires first marks the check
  // done and the other steps aside, so Store access is looked up once.
  .use("/:id", requireOrderAccess)
  .use("/:id/*", requireOrderAccess)
  .get("/", zodValidator("query", GETOrdersQuerySchema), async (c) => {
    const query = c.req.valid("query");
    const user = c.get("jwtPayload");

    const { items, meta } = await listOrders(query, user);

    return c.json(success(items, undefined, meta));
  })
  // Same filters as the list; the status filter itself is ignored, because the
  // tabs show every status at once.
  .get("/counts", zodValidator("query", GETOrdersQuerySchema), async (c) => {
    const query = c.req.valid("query");
    const user = c.get("jwtPayload");

    return c.json(success(await getOrderStatusCounts(query, user)));
  })
  .get(
    "/services/queue",
    zodValidator("query", GETOrderServiceQueueQuerySchema),
    async (c) => {
      const user = c.get("jwtPayload");
      const query = c.req.valid("query");

      const { items, meta } = await getOrderServiceQueue(user, query);

      return c.json(success(items, undefined, meta));
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
    "/services/me",
    zodValidator("query", GETMyOrderServicesQuerySchema),
    async (c) => {
      const user = c.get("jwtPayload");
      const query = c.req.valid("query");

      const rows = await getMyOrderServices(user, query);

      return c.json(success(rows));
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
  // Registered ahead of /:id so a search for "lookup" is never read as an
  // order id.
  .get(
    "/lookup",
    zodValidator("query", GETOrderLookupQuerySchema),
    async (c) => {
      const user = c.get("jwtPayload");
      const { q } = c.req.valid("query");

      const result = await resolveOrderLookup(user, q);

      return c.json(success(result));
    }
  )
  .get("/:id", idParamSchema, async (c) => {
    const { id } = c.req.valid("param");

    const detail = await getOrderDetailById(id);

    if (!detail) {
      throw new NotFoundException("Order not found");
    }

    return c.json(success(detail));
  })
  .get("/:id/receipt", idParamSchema, async (c) => {
    const { id } = c.req.valid("param");

    const receipt = await getOrderReceiptById(id);

    if (!receipt) {
      throw new NotFoundException("Order not found");
    }

    return c.json(success(receipt));
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

      await cancelOrderPendingCharges(id);

      return c.json(success(payment, "Marked as paid"));
    }
  )
  .post(
    "/:id/payment-charges",
    idParamSchema,
    zodValidator("json", POSTPaymentChargeSchema),
    async (c) => {
      assertCanProcessPayment(c.get("jwtPayload"));
      const { id } = c.req.valid("param");
      const { kind, ...request } = c.req.valid("json");

      const charge = await createPaymentCharge({
        createdBy: c.get("jwtPayload").id,
        kind,
        orderId: id,
        request,
      });

      return c.json(success(charge), StatusCodes.CREATED);
    }
  )
  // Before /:chargeId, which would read "open" as an id.
  .get("/:id/payment-charges/open", idParamSchema, async (c) => {
    assertCanProcessPayment(c.get("jwtPayload"));
    const { id } = c.req.valid("param");

    return c.json(success(await getOpenQrisCharge(id)));
  })
  .get(
    "/:id/payment-charges/:chargeId",
    paymentChargeParamSchema,
    async (c) => {
      assertCanProcessPayment(c.get("jwtPayload"));
      const { id, chargeId } = c.req.valid("param");

      const charge = await getPaymentCharge(id, chargeId);

      if (!charge) {
        throw new NotFoundException("Payment charge not found");
      }

      return c.json(success(charge));
    }
  )
  .post(
    "/:id/payment-charges/:chargeId/cancel",
    paymentChargeParamSchema,
    async (c) => {
      assertCanProcessPayment(c.get("jwtPayload"));
      const { id, chargeId } = c.req.valid("param");

      const charge = await cancelPaymentCharge(id, chargeId);

      if (!charge) {
        throw new NotFoundException("Payment charge not found");
      }

      return c.json(success(charge));
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

      return c.json(success(updated, "Courier updated"));
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

      return c.json(success(signed));
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
  .post("/:id/pickup-notices", idParamSchema, async (c) => {
    const user = c.get("jwtPayload");
    const { id } = c.req.valid("param");

    await createOrderPickupNotice({ orderId: id, user });

    return c.json(success(null, "Pickup notice recorded"), StatusCodes.CREATED);
  })
  .get("/:id/services/:serviceId", orderServiceParamSchema, async (c) => {
    const { id, serviceId } = c.req.valid("param");

    const detail = await getOrderServiceDetail(id, serviceId);

    if (!detail) {
      throw new NotFoundException("Order service not found");
    }

    return c.json(success(detail));
  })
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

      return c.json(success(result, "Work started"));
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

      return c.json(success(result, "Handler updated"));
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
      await cancelOrderPendingCharges(id);

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

      return c.json(success(result, "Status updated"));
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

      return c.json(success(signed));
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

      return c.json(success(signed));
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

      return c.json(success(result, "Refund recorded"), StatusCodes.CREATED);
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
      await cancelOrderPendingCharges(id);

      return c.json(success(result, "Order cancelled"));
    }
  );

export default app;
