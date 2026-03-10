import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  orderRefundItemsTable,
  orderRefundsTable,
  orderServiceHandlerLogsTable,
  orderServiceStatusLogsTable,
  orderServicesImagesTable,
  ordersProductsTable,
  ordersServicesTable,
  ordersTable,
  servicesTable,
  storesTable,
} from "@/db/schema";
import { BadRequestException, ForbiddenException } from "@/errors";
import type {
  GetMyOrderServicesQuery,
  PatchOrderPaymentInput,
  PatchOrderServiceHandlerInput,
  PatchOrderServiceStatusInput,
  PostOrderRefundInput,
  PostOrderServicePhotoInput,
  PostOrderServicePhotoPresignInput,
} from "@/modules/orders/order-admin.schema";
import { ORDER_STATUS_TRANSITIONS } from "@/modules/orders/order-admin.schema";
import type { JWTPayload } from "@/types";
import { assertStoreAccess, getUserStoreIds } from "@/utils/authorization";
import { buildS3ObjectUrl, createPresignedUploadUrl } from "@/utils/s3";

const ORDER_TERMINAL_SERVICE_STATUSES = new Set([
  "picked_up",
  "refunded",
  "cancelled",
]);

function roundCurrencyUnit(value: number) {
  return Math.round(value);
}

function buildRefundItems({
  capsByServiceId,
  items,
}: {
  capsByServiceId: Map<number, number>;
  items: PostOrderRefundInput["items"];
}) {
  const refundItems = items.map((item) => {
    const maxRefundable = capsByServiceId.get(item.order_service_id) ?? 0;
    if (maxRefundable <= 0) {
      throw new BadRequestException(
        `Order service ${item.order_service_id} has no refundable amount remaining`
      );
    }

    return {
      ...item,
      amount: Math.floor(maxRefundable),
      preciseAmount: maxRefundable,
    };
  });

  const roundedTotalRefundAmount = roundCurrencyUnit(
    refundItems.reduce((sum, item) => sum + item.preciseAmount, 0)
  );

  let remainingWholeUnits =
    roundedTotalRefundAmount -
    refundItems.reduce((sum, item) => sum + item.amount, 0);

  const itemsByLargestRemainder = [...refundItems].sort((left, right) => {
    const remainderDiff =
      right.preciseAmount - right.amount - (left.preciseAmount - left.amount);

    return remainderDiff !== 0
      ? remainderDiff
      : left.order_service_id - right.order_service_id;
  });

  for (const item of itemsByLargestRemainder) {
    if (remainingWholeUnits <= 0) {
      break;
    }

    item.amount += 1;
    remainingWholeUnits -= 1;
  }

  if (remainingWholeUnits > 0) {
    throw new BadRequestException(
      "Refund amount could not be allocated across the selected services"
    );
  }

  return refundItems.map(({ preciseAmount, ...item }) => item);
}

function assertIsAdmin(user: JWTPayload) {
  if (user.role !== "admin") {
    throw new ForbiddenException("Only admin can perform this action");
  }
}

export function assertCanProcessPaymentOrRefund(user: JWTPayload) {
  if (!["admin", "cashier"].includes(user.role)) {
    throw new ForbiddenException(
      "Only admin or cashier can perform this action"
    );
  }
}

async function getOrderServiceOrThrow(orderId: number, serviceId: number) {
  const orderService = await db.query.ordersServicesTable.findFirst({
    where: and(
      eq(ordersServicesTable.order_id, orderId),
      eq(ordersServicesTable.id, serviceId)
    ),
  });

  if (!orderService) {
    throw new BadRequestException("Order service not found for this order");
  }

  return orderService;
}

async function recalculateOrderStatus(orderId: number, updatedBy: number) {
  const [services, products] = await Promise.all([
    db.query.ordersServicesTable.findMany({
      where: eq(ordersServicesTable.order_id, orderId),
      columns: { status: true },
    }),
    db.$count(ordersProductsTable, eq(ordersProductsTable.order_id, orderId)),
  ]);

  let nextStatus: "created" | "processing" | "completed" | "cancelled" =
    "created";

  if (services.length === 0) {
    nextStatus = products > 0 ? "completed" : "created";
  } else if (
    services.every((item) => ORDER_TERMINAL_SERVICE_STATUSES.has(item.status))
  ) {
    nextStatus = "completed";
  } else if (services.some((item) => item.status !== "received")) {
    nextStatus = "processing";
  }

  await db
    .update(ordersTable)
    .set({
      status: nextStatus,
      completed_at: nextStatus === "completed" ? new Date() : null,
      updated_by: updatedBy,
    })
    .where(eq(ordersTable.id, orderId));
}

async function getOrderLineRefundCaps(orderId: number) {
  const [order, serviceRows, refundedRows] = await Promise.all([
    db.query.ordersTable.findFirst({
      where: eq(ordersTable.id, orderId),
      columns: {
        id: true,
        total: true,
        discount: true,
      },
    }),
    db.query.ordersServicesTable.findMany({
      where: eq(ordersServicesTable.order_id, orderId),
      columns: {
        id: true,
        subtotal: true,
      },
    }),
    db
      .select({
        order_service_id: orderRefundItemsTable.order_service_id,
        refunded_total: sql<string>`COALESCE(SUM(${orderRefundItemsTable.amount}), 0)`,
      })
      .from(orderRefundItemsTable)
      .innerJoin(
        orderRefundsTable,
        eq(orderRefundItemsTable.order_refund_id, orderRefundsTable.id)
      )
      .where(eq(orderRefundsTable.order_id, orderId))
      .groupBy(orderRefundItemsTable.order_service_id),
  ]);

  if (!order) {
    throw new BadRequestException("Order not found");
  }

  const grossTotal = Number(order.total ?? 0);
  const orderDiscount = Number(order.discount);

  const refundedByServiceId = new Map(
    refundedRows.map((row) => [
      row.order_service_id,
      Number(row.refunded_total),
    ])
  );

  return serviceRows.map((row) => {
    const grossLine = Number(row.subtotal ?? 0);
    const allocatedDiscount =
      grossTotal > 0 ? (grossLine / grossTotal) * orderDiscount : 0;
    const refundableGross = Math.max(0, grossLine - allocatedDiscount);
    const alreadyRefunded = refundedByServiceId.get(row.id) ?? 0;

    return {
      maxRefundable: Math.max(0, refundableGross - alreadyRefunded),
      order_service_id: row.id,
    };
  });
}

export function getOrderServiceByItemCode(item_code: string) {
  return db.query.ordersServicesTable.findFirst({
    where: eq(ordersServicesTable.item_code, item_code),
    with: {
      order: {
        columns: {
          id: true,
          code: true,
          store_id: true,
          status: true,
        },
      },
      service: {
        columns: {
          id: true,
          code: true,
          name: true,
        },
      },
      handler: {
        columns: {
          id: true,
          name: true,
        },
      },
    },
  });
}

export async function getMyOrderServices(
  user: JWTPayload,
  query: GetMyOrderServicesQuery
) {
  const conditions = [eq(ordersServicesTable.handler_id, user.id)];

  if (!query.include_terminal) {
    conditions.push(
      sql`${ordersServicesTable.status} NOT IN ('picked_up', 'refunded', 'cancelled')`
    );
  }

  if (user.role === "admin") {
    if (query.store_id !== undefined) {
      conditions.push(eq(ordersTable.store_id, query.store_id));
    }
  } else if (query.store_id !== undefined) {
    await assertStoreAccess(user, query.store_id);
    conditions.push(eq(ordersTable.store_id, query.store_id));
  } else {
    const storeIds = await getUserStoreIds(user.id);
    if (storeIds.length === 0) {
      return [];
    }

    conditions.push(inArray(ordersTable.store_id, storeIds));
  }

  return db
    .select({
      color: ordersServicesTable.color,
      handler_id: ordersServicesTable.handler_id,
      id: ordersServicesTable.id,
      item_code: ordersServicesTable.item_code,
      order_code: ordersTable.code,
      order_created_at: ordersTable.created_at,
      order_id: ordersTable.id,
      service_code: servicesTable.code,
      service_name: servicesTable.name,
      shoe_brand: ordersServicesTable.shoe_brand,
      shoe_size: ordersServicesTable.shoe_size,
      status: ordersServicesTable.status,
      store_code: storesTable.code,
      store_id: storesTable.id,
      store_name: storesTable.name,
    })
    .from(ordersServicesTable)
    .innerJoin(ordersTable, eq(ordersServicesTable.order_id, ordersTable.id))
    .innerJoin(storesTable, eq(ordersTable.store_id, storesTable.id))
    .innerJoin(
      servicesTable,
      eq(ordersServicesTable.service_id, servicesTable.id)
    )
    .where(and(...conditions))
    .orderBy(asc(ordersServicesTable.id));
}

export function getOrderDetailById(id: number) {
  return db.query.ordersTable.findFirst({
    where: eq(ordersTable.id, id),
    with: {
      campaign: true,
      customer: true,
      paymentMethod: true,
      products: {
        with: {
          product: true,
        },
      },
      refunds: {
        with: {
          items: true,
          refundedBy: {
            columns: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: [asc(orderRefundsTable.id)],
      },
      services: {
        with: {
          handler: {
            columns: {
              id: true,
              name: true,
            },
          },
          handlerLogs: {
            with: {
              changedBy: {
                columns: {
                  id: true,
                  name: true,
                },
              },
              fromHandler: {
                columns: {
                  id: true,
                  name: true,
                },
              },
              toHandler: {
                columns: {
                  id: true,
                  name: true,
                },
              },
            },
            orderBy: [asc(orderServiceHandlerLogsTable.id)],
          },
          images: {
            orderBy: [asc(orderServicesImagesTable.id)],
          },
          refundItems: true,
          service: true,
          statusLogs: {
            with: {
              changedBy: {
                columns: {
                  id: true,
                  name: true,
                },
              },
            },
            orderBy: [asc(orderServiceStatusLogsTable.id)],
          },
        },
        orderBy: [asc(ordersServicesTable.id)],
      },
      store: true,
    },
  });
}

export async function updateOrderPayment({
  orderId,
  body,
  user,
}: {
  orderId: number;
  body: PatchOrderPaymentInput;
  user: JWTPayload;
}) {
  assertCanProcessPaymentOrRefund(user);

  const order = await db.query.ordersTable.findFirst({
    where: eq(ordersTable.id, orderId),
    columns: {
      id: true,
      total: true,
      discount: true,
      refunded_amount: true,
    },
  });

  if (!order) {
    return null;
  }

  const netDue =
    Number(order.total ?? 0) -
    Number(order.discount) -
    Number(order.refunded_amount);

  const rows = await db
    .update(ordersTable)
    .set({
      payment_method_id: body.payment_method_id,
      payment_status: "paid",
      paid_amount: Math.max(netDue, 0).toString(),
      paid_at: new Date(),
      updated_by: user.id,
    })
    .where(eq(ordersTable.id, orderId))
    .returning({
      id: ordersTable.id,
      payment_status: ordersTable.payment_status,
      paid_amount: ordersTable.paid_amount,
    });

  return rows[0] ?? null;
}

export async function claimOrderService({
  orderId,
  serviceId,
  user,
}: {
  orderId: number;
  serviceId: number;
  user: JWTPayload;
}) {
  const orderService = await getOrderServiceOrThrow(orderId, serviceId);

  await db.transaction(async (tx) => {
    await tx
      .update(ordersServicesTable)
      .set({ handler_id: user.id })
      .where(eq(ordersServicesTable.id, serviceId));

    await tx.insert(orderServiceHandlerLogsTable).values({
      order_service_id: serviceId,
      from_handler_id: orderService.handler_id,
      to_handler_id: user.id,
      changed_by: user.id,
      note: "Claimed by handler",
    });
  });

  return { order_service_id: serviceId, handler_id: user.id };
}

export async function updateOrderServiceHandler({
  orderId,
  serviceId,
  body,
  user,
}: {
  orderId: number;
  serviceId: number;
  body: PatchOrderServiceHandlerInput;
  user: JWTPayload;
}) {
  assertIsAdmin(user);

  const orderService = await getOrderServiceOrThrow(orderId, serviceId);

  await db.transaction(async (tx) => {
    await tx
      .update(ordersServicesTable)
      .set({ handler_id: body.handler_id })
      .where(eq(ordersServicesTable.id, serviceId));

    await tx.insert(orderServiceHandlerLogsTable).values({
      order_service_id: serviceId,
      from_handler_id: orderService.handler_id,
      to_handler_id: body.handler_id,
      changed_by: user.id,
      note: body.note,
    });
  });

  return {
    order_service_id: serviceId,
    handler_id: body.handler_id,
  };
}

export async function updateOrderServiceStatus({
  orderId,
  serviceId,
  body,
  user,
}: {
  orderId: number;
  serviceId: number;
  body: PatchOrderServiceStatusInput;
  user: JWTPayload;
}) {
  const orderService = await getOrderServiceOrThrow(orderId, serviceId);

  const allowedStatuses = ORDER_STATUS_TRANSITIONS[orderService.status];
  if (!allowedStatuses.includes(body.status)) {
    throw new BadRequestException(
      `Invalid status transition from ${orderService.status} to ${body.status}`
    );
  }

  if (orderService.status === "received" && body.status !== "received") {
    const hasDropoffPhoto = await db.query.orderServicesImagesTable.findFirst({
      where: and(
        eq(orderServicesImagesTable.order_service_id, serviceId),
        eq(orderServicesImagesTable.photo_type, "dropoff")
      ),
      columns: { id: true },
    });

    if (!hasDropoffPhoto) {
      throw new BadRequestException(
        "At least one dropoff photo is required before processing"
      );
    }
  }

  if (body.status === "picked_up") {
    const hasPickupPhoto = await db.query.orderServicesImagesTable.findFirst({
      where: and(
        eq(orderServicesImagesTable.order_service_id, serviceId),
        eq(orderServicesImagesTable.photo_type, "pickup")
      ),
      columns: { id: true },
    });

    if (!hasPickupPhoto) {
      throw new BadRequestException(
        "At least one pickup photo is required before marking picked up"
      );
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .update(ordersServicesTable)
      .set({ status: body.status })
      .where(eq(ordersServicesTable.id, serviceId));

    await tx.insert(orderServiceStatusLogsTable).values({
      order_service_id: serviceId,
      from_status: orderService.status,
      to_status: body.status,
      changed_by: user.id,
      note: body.note,
    });
  });

  await recalculateOrderStatus(orderId, user.id);

  return {
    from_status: orderService.status,
    order_service_id: serviceId,
    to_status: body.status,
  };
}

export async function createOrderServicePhotoPresign({
  orderId,
  serviceId,
  body,
}: {
  orderId: number;
  serviceId: number;
  body: PostOrderServicePhotoPresignInput;
}) {
  await getOrderServiceOrThrow(orderId, serviceId);

  const key = `orders/${orderId}/services/${serviceId}/${body.photo_type}/${crypto.randomUUID()}`;
  return createPresignedUploadUrl({
    contentType: body.content_type,
    key,
  });
}

export async function saveOrderServicePhoto({
  orderId,
  serviceId,
  body,
  user,
}: {
  orderId: number;
  serviceId: number;
  body: PostOrderServicePhotoInput;
  user: JWTPayload;
}) {
  await getOrderServiceOrThrow(orderId, serviceId);

  const [photo] = await db
    .insert(orderServicesImagesTable)
    .values({
      order_service_id: serviceId,
      photo_type: body.photo_type,
      s3_key: body.s3_key,
      image_url: buildS3ObjectUrl(body.s3_key),
      uploaded_by: user.id,
    })
    .returning();

  return photo;
}

export async function createOrderRefund({
  orderId,
  body,
  user,
}: {
  orderId: number;
  body: PostOrderRefundInput;
  user: JWTPayload;
}) {
  assertCanProcessPaymentOrRefund(user);

  const uniqueServiceIds = [
    ...new Set(body.items.map((item) => item.order_service_id)),
  ];
  if (uniqueServiceIds.length !== body.items.length) {
    throw new BadRequestException(
      "Duplicate order_service_id entries are not allowed"
    );
  }

  const order = await db.query.ordersTable.findFirst({
    where: eq(ordersTable.id, orderId),
    columns: {
      id: true,
      payment_status: true,
      paid_amount: true,
      refunded_amount: true,
    },
  });

  if (!order) {
    throw new BadRequestException("Order not found");
  }

  if (order.payment_status !== "paid") {
    throw new BadRequestException(
      "Refund can only be processed for paid orders"
    );
  }

  const services = await db.query.ordersServicesTable.findMany({
    where: and(
      eq(ordersServicesTable.order_id, orderId),
      inArray(ordersServicesTable.id, uniqueServiceIds)
    ),
    columns: {
      id: true,
      status: true,
    },
  });

  if (services.length !== uniqueServiceIds.length) {
    throw new BadRequestException("One or more order_service_id is invalid");
  }

  for (const service of services) {
    if (["picked_up", "refunded", "cancelled"].includes(service.status)) {
      throw new BadRequestException(
        `Service ${service.id} cannot be refunded from status ${service.status}`
      );
    }
  }

  const refundCaps = await getOrderLineRefundCaps(orderId);
  const capsByServiceId = new Map(
    refundCaps.map((item) => [item.order_service_id, item.maxRefundable])
  );

  const refundItems = buildRefundItems({
    capsByServiceId,
    items: body.items,
  });

  const totalRefundAmount = refundItems.reduce(
    (sum, item) => sum + item.amount,
    0
  );

  const refundablePaidAmount =
    Number(order.paid_amount) - Number(order.refunded_amount);
  if (totalRefundAmount > refundablePaidAmount) {
    throw new BadRequestException(
      "Refund exceeds remaining paid amount for this order"
    );
  }

  const [refund] = await db.transaction(async (tx) => {
    await tx
      .update(ordersTable)
      .set({
        refunded_amount: sql`${ordersTable.refunded_amount} + ${totalRefundAmount}`,
        updated_by: user.id,
      })
      .where(eq(ordersTable.id, orderId));

    const [createdRefund] = await tx
      .insert(orderRefundsTable)
      .values({
        order_id: orderId,
        refunded_by: user.id,
        total_amount: totalRefundAmount.toString(),
        note: body.note,
      })
      .returning();

    await tx.insert(orderRefundItemsTable).values(
      refundItems.map((item) => ({
        order_refund_id: createdRefund.id,
        order_service_id: item.order_service_id,
        amount: item.amount.toString(),
        reason: item.reason,
        note: item.note,
      }))
    );

    await tx
      .update(ordersServicesTable)
      .set({ status: "refunded" })
      .where(
        inArray(
          ordersServicesTable.id,
          refundItems.map((item) => item.order_service_id)
        )
      );

    await tx.insert(orderServiceStatusLogsTable).values(
      refundItems.map((item) => ({
        order_service_id: item.order_service_id,
        from_status: services.find(
          (service) => service.id === item.order_service_id
        )?.status,
        to_status: "refunded" as const,
        changed_by: user.id,
        note: item.note,
      }))
    );

    return [createdRefund] as const;
  });

  await recalculateOrderStatus(orderId, user.id);

  return {
    refund,
    total_refund_amount: totalRefundAmount,
  };
}
