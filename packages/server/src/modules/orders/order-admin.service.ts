import dayjs from "dayjs";
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  orderPickupEventsTable,
  orderRefundItemsTable,
  orderRefundsTable,
  orderServiceHandlerLogsTable,
  type orderServiceStatusEnum,
  orderServiceStatusLogsTable,
  orderServicesImagesTable,
  ordersProductsTable,
  ordersServicesTable,
  ordersTable,
  servicesTable,
  storesTable,
  usersTable,
} from "@/db/schema";
import { BadRequestException, ForbiddenException } from "@/errors";
import type { OrderTx } from "@/modules/orders/order.repository";
import type {
  GetMyOrderServicesQuery,
  GetOrderServiceQueueQuery,
  PatchOrderPaymentInput,
  PatchOrderServiceHandlerInput,
  PatchOrderServiceStatusInput,
  PostOrderDropoffPhotoPresignInput,
  PostOrderPickupEventInput,
  PostOrderPickupEventPresignInput,
  PostOrderRefundInput,
  PostOrderServicePhotoInput,
  PostOrderServicePhotoPresignInput,
  PutOrderDropoffPhotoInput,
} from "@/modules/orders/order-admin.schema";
import {
  normalizeOrderServiceQueueQuery,
  ORDER_STATUS_TRANSITIONS,
} from "@/modules/orders/order-admin.schema";
import {
  isTerminalOrderServiceStatus,
  summarizeOrderFulfillment,
} from "@/modules/orders/order-fulfillment";
import type { JWTPayload } from "@/types";
import { assertStoreAccess, getUserStoreIds } from "@/utils/authorization";
import { buildPaginationMeta } from "@/utils/pagination";
import { buildMediaUrl, createPresignedUploadUrl } from "@/utils/s3";

const numericSearchRegex = /^\d+$/;

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

const getOrderServicePrepared = db.query.ordersServicesTable
  .findFirst({
    where: {
      order_id: { eq: sql.placeholder("order_id") },
      id: { eq: sql.placeholder("id") },
    },
  })
  .prepare("get_order_service");

async function getOrderServiceOrThrow(orderId: number, serviceId: number) {
  const orderService = await getOrderServicePrepared.execute({
    order_id: orderId,
    id: serviceId,
  });

  if (!orderService) {
    throw new BadRequestException("Order service not found for this order");
  }

  return orderService;
}

function assertCanProcessPickup(user: JWTPayload) {
  const allowed =
    user.role === "admin" ||
    user.role === "cashier" ||
    user.can_process_pickup === true;

  if (!allowed) {
    throw new ForbiddenException(
      "Only admin, cashier, or authorized pickup handlers can complete pickups"
    );
  }
}

type DerivedOrderStatus =
  | "created"
  | "processing"
  | "ready_for_pickup"
  | "completed"
  | "cancelled";

function deriveOrderStatus(
  services: { status: (typeof orderServiceStatusEnum.enumValues)[number] }[],
  productCount: number
): DerivedOrderStatus {
  if (services.length === 0) {
    return productCount > 0 ? "completed" : "created";
  }

  if (services.every((item) => isTerminalOrderServiceStatus(item.status))) {
    return services.every((item) => item.status === "cancelled")
      ? "cancelled"
      : "completed";
  }

  const activeServices = services.filter(
    (item) => !isTerminalOrderServiceStatus(item.status)
  );
  if (activeServices.every((item) => item.status === "ready_for_pickup")) {
    return "ready_for_pickup";
  }

  if (services.some((item) => item.status !== "queued")) {
    return "processing";
  }

  return "created";
}

async function recalculateOrderStatus(
  tx: OrderTx,
  orderId: number,
  updatedBy: number
) {
  const [services, productCount] = await Promise.all([
    tx.query.ordersServicesTable.findMany({
      where: { order_id: orderId },
      columns: { status: true },
    }),
    tx.$count(ordersProductsTable, eq(ordersProductsTable.order_id, orderId)),
  ]);

  const nextStatus = deriveOrderStatus(services, productCount);

  await tx
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
      where: { id: orderId },
      columns: {
        id: true,
        total: true,
        discount: true,
      },
    }),
    db.query.ordersServicesTable.findMany({
      where: { order_id: orderId },
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

const queueRelationColumns = {
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
} as const;

const getOrderServiceByItemCodePrepared = db.query.ordersServicesTable
  .findFirst({
    where: { item_code: { eq: sql.placeholder("item_code") } },
    with: queueRelationColumns,
  })
  .prepare("get_order_service_by_item_code");

const getOrderServiceByIdPrepared = db.query.ordersServicesTable
  .findFirst({
    where: { id: { eq: sql.placeholder("id") } },
    with: queueRelationColumns,
  })
  .prepare("get_order_service_by_id");

export function getOrderServiceByItemCode(item_code: string) {
  return getOrderServiceByItemCodePrepared.execute({ item_code });
}

export function getOrderServiceById(serviceId: number) {
  return getOrderServiceByIdPrepared.execute({ id: serviceId });
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
      brand: ordersServicesTable.brand,
      color: ordersServicesTable.color,
      handler_id: ordersServicesTable.handler_id,
      id: ordersServicesTable.id,
      is_priority: ordersServicesTable.is_priority,
      item_code: ordersServicesTable.item_code,
      model: ordersServicesTable.model,
      order_code: ordersTable.code,
      order_created_at: ordersTable.created_at,
      order_id: ordersTable.id,
      service_code: servicesTable.code,
      service_name: servicesTable.name,
      size: ordersServicesTable.size,
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

export async function getOrderServiceQueue(
  user: JWTPayload,
  query?: GetOrderServiceQueueQuery
) {
  const normalized = normalizeOrderServiceQueueQuery(query);
  const conditions = [
    sql`${ordersServicesTable.status} NOT IN ('picked_up', 'refunded', 'cancelled')`,
  ];

  if (user.role === "admin") {
    if (normalized.store_id === undefined) {
      throw new BadRequestException("Store is required for admin queue access");
    }

    conditions.push(eq(ordersTable.store_id, normalized.store_id));
  } else if (normalized.store_id !== undefined) {
    await assertStoreAccess(user, normalized.store_id);
    conditions.push(eq(ordersTable.store_id, normalized.store_id));
  } else {
    const storeIds = await getUserStoreIds(user.id);
    if (storeIds.length === 0) {
      return {
        items: [],
        meta: buildPaginationMeta(0, normalized),
      };
    }

    conditions.push(inArray(ordersTable.store_id, storeIds));
  }

  if (normalized.status !== undefined) {
    conditions.push(eq(ordersServicesTable.status, normalized.status));
  }

  if (normalized.search) {
    const search = normalized.search.trim();
    const loweredSearchPrefix = `${search.toLowerCase()}%`;
    const searchConditions = [
      sql`LOWER(${ordersTable.code}) LIKE ${loweredSearchPrefix}`,
      sql`LOWER(${ordersServicesTable.item_code}) LIKE ${loweredSearchPrefix}`,
    ];

    if (numericSearchRegex.test(search)) {
      const numericSearch = Number(search);

      searchConditions.push(eq(ordersTable.id, numericSearch));
      searchConditions.push(eq(ordersServicesTable.id, numericSearch));
    }

    conditions.push(sql`(${sql.join(searchConditions, sql` OR `)})`);
  }

  if (normalized.date_from) {
    conditions.push(
      gte(
        ordersTable.created_at,
        dayjs(normalized.date_from).startOf("day").toDate()
      )
    );
  }

  if (normalized.date_to) {
    conditions.push(
      lte(
        ordersTable.created_at,
        dayjs(normalized.date_to).endOf("day").toDate()
      )
    );
  }

  const whereClause = and(...conditions);

  const [items, countRows] = await Promise.all([
    db
      .select({
        brand: ordersServicesTable.brand,
        color: ordersServicesTable.color,
        handler_id: ordersServicesTable.handler_id,
        handler_name: usersTable.name,
        id: ordersServicesTable.id,
        is_priority: ordersServicesTable.is_priority,
        item_code: ordersServicesTable.item_code,
        model: ordersServicesTable.model,
        order_code: ordersTable.code,
        order_created_at: ordersTable.created_at,
        order_id: ordersTable.id,
        service_name: servicesTable.name,
        size: ordersServicesTable.size,
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
      .leftJoin(usersTable, eq(ordersServicesTable.handler_id, usersTable.id))
      .where(whereClause)
      .orderBy(
        desc(ordersServicesTable.is_priority),
        asc(ordersTable.created_at),
        asc(ordersServicesTable.id)
      )
      .limit(normalized.limit)
      .offset(normalized.offset),
    db
      .select({
        total: sql<number>`count(*)`,
      })
      .from(ordersServicesTable)
      .innerJoin(ordersTable, eq(ordersServicesTable.order_id, ordersTable.id))
      .where(whereClause),
  ]);

  return {
    items,
    meta: buildPaginationMeta(Number(countRows[0]?.total ?? 0), normalized),
  };
}

export async function getOrderDetailById(id: number) {
  const detail = await db.query.ordersTable.findFirst({
    where: { id },
    with: {
      campaigns: {
        with: {
          campaign: true,
        },
        orderBy: { id: "asc" },
      },
      customer: true,
      paymentMethod: true,
      pickupEvents: {
        with: {
          pickedUpBy: {
            columns: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: { picked_up_at: "asc" },
      },
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
        orderBy: { id: "asc" },
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
            orderBy: { id: "asc" },
          },
          images: {
            orderBy: { id: "asc" },
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
            orderBy: { id: "asc" },
          },
        },
        orderBy: { id: "asc" },
      },
      store: true,
    },
  });

  if (!detail) {
    return null;
  }

  return {
    ...detail,
    dropoff_photo_url: buildMediaUrl(detail.dropoff_photo_path),
    pickup_events: detail.pickupEvents.map((event) => ({
      created_at: event.created_at,
      id: event.id,
      image_url: buildMediaUrl(event.image_path),
      picked_up_at: event.picked_up_at,
      picked_up_by: event.pickedUpBy,
    })),
    services: detail.services.map((service) => ({
      ...service,
      images: service.images.map((image) => ({
        ...image,
        image_url: buildMediaUrl(image.image_path),
      })),
    })),
    fulfillment: summarizeOrderFulfillment(
      detail.services.map((service) => service.status)
    ),
  };
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
    where: { id: orderId },
    columns: {
      id: true,
      total: true,
      discount: true,
      refunded_amount: true,
      payment_status: true,
      status: true,
    },
  });

  if (!order) {
    return null;
  }

  if (order.payment_status === "paid") {
    throw new BadRequestException("Order has already been paid");
  }

  if (order.status === "cancelled") {
    throw new BadRequestException(
      "Cannot collect payment on a cancelled order"
    );
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

export async function startOrderServiceWork({
  orderId,
  serviceId,
  user,
}: {
  orderId: number;
  serviceId: number;
  user: JWTPayload;
}) {
  const orderService = await db.transaction(async (tx) => {
    const [locked] = await tx
      .select()
      .from(ordersServicesTable)
      .where(
        and(
          eq(ordersServicesTable.id, serviceId),
          eq(ordersServicesTable.order_id, orderId)
        )
      )
      .for("update");

    if (!locked) {
      throw new BadRequestException("Order service not found for this order");
    }

    if (locked.status !== "queued") {
      throw new BadRequestException(
        `Service ${serviceId} cannot be started from status ${locked.status}`
      );
    }

    if (
      locked.handler_id !== null &&
      locked.handler_id !== undefined &&
      locked.handler_id !== user.id
    ) {
      throw new ForbiddenException(
        "This item is already assigned to another worker"
      );
    }

    if (locked.handler_id !== user.id) {
      await tx
        .update(ordersServicesTable)
        .set({ handler_id: user.id, status: "processing" })
        .where(eq(ordersServicesTable.id, serviceId));

      await tx.insert(orderServiceHandlerLogsTable).values({
        order_service_id: serviceId,
        from_handler_id: locked.handler_id,
        to_handler_id: user.id,
        changed_by: user.id,
        note: "Started from queue",
      });
    } else {
      await tx
        .update(ordersServicesTable)
        .set({ status: "processing" })
        .where(eq(ordersServicesTable.id, serviceId));
    }

    await tx.insert(orderServiceStatusLogsTable).values({
      order_service_id: serviceId,
      from_status: locked.status,
      to_status: "processing",
      changed_by: user.id,
      note: "Started from queue",
    });

    await recalculateOrderStatus(tx, orderId, user.id);

    return locked;
  });

  return {
    from_status: orderService.status,
    handler_id: user.id,
    order_service_id: serviceId,
    to_status: "processing" as const,
  };
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
  if (
    user.role === "worker" &&
    (body.status === "cancelled" || body.status === "refunded")
  ) {
    throw new ForbiddenException(
      "Workers cannot cancel or refund items from the Queue"
    );
  }

  if (body.status === "picked_up") {
    throw new BadRequestException(
      "Items must be picked up through the pickup desk, not the status dropdown"
    );
  }

  const fromStatus = await db.transaction(async (tx) => {
    const [locked] = await tx
      .select()
      .from(ordersServicesTable)
      .where(
        and(
          eq(ordersServicesTable.id, serviceId),
          eq(ordersServicesTable.order_id, orderId)
        )
      )
      .for("update");

    if (!locked) {
      throw new BadRequestException("Order service not found for this order");
    }

    const allowedStatuses = ORDER_STATUS_TRANSITIONS[locked.status];
    if (!allowedStatuses.includes(body.status)) {
      throw new BadRequestException(
        `Invalid status transition from ${locked.status} to ${body.status}`
      );
    }

    const isClaimTransition =
      locked.status === "queued" && body.status === "processing";
    const needsHandlerAssign =
      isClaimTransition && locked.handler_id !== user.id;

    const cancelReason =
      body.status === "cancelled" ? body.cancel_reason?.trim() : undefined;
    const cancelReasonPatch = cancelReason
      ? { cancel_reason: cancelReason }
      : {};

    if (needsHandlerAssign) {
      await tx
        .update(ordersServicesTable)
        .set({
          handler_id: user.id,
          status: body.status,
          ...cancelReasonPatch,
        })
        .where(eq(ordersServicesTable.id, serviceId));

      await tx.insert(orderServiceHandlerLogsTable).values({
        order_service_id: serviceId,
        from_handler_id: locked.handler_id,
        to_handler_id: user.id,
        changed_by: user.id,
        note: "Auto-assigned on status update",
      });
    } else {
      await tx
        .update(ordersServicesTable)
        .set({
          status: body.status,
          ...cancelReasonPatch,
        })
        .where(eq(ordersServicesTable.id, serviceId));
    }

    await tx.insert(orderServiceStatusLogsTable).values({
      order_service_id: serviceId,
      from_status: locked.status,
      to_status: body.status,
      changed_by: user.id,
      note: body.note,
    });

    await recalculateOrderStatus(tx, orderId, user.id);

    return locked.status;
  });

  return {
    from_status: fromStatus,
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

  const key = `orders/${orderId}/services/${serviceId}/${crypto.randomUUID()}`;
  return createPresignedUploadUrl({
    contentType: body.content_type,
    key,
  });
}

export async function createOrderDropoffPhotoPresign({
  orderId,
  body,
}: {
  orderId: number;
  body: PostOrderDropoffPhotoPresignInput;
}) {
  const order = await db.query.ordersTable.findFirst({
    where: { id: orderId },
    columns: { id: true },
  });

  if (!order) {
    throw new BadRequestException("Order not found");
  }

  const key = `orders/${orderId}/dropoff/${crypto.randomUUID()}`;
  return createPresignedUploadUrl({
    contentType: body.content_type,
    key,
  });
}

export async function createOrderPickupEventPresign({
  orderId,
  body,
  user,
}: {
  orderId: number;
  body: PostOrderPickupEventPresignInput;
  user: JWTPayload;
}) {
  assertCanProcessPickup(user);

  const order = await db.query.ordersTable.findFirst({
    where: { id: orderId },
    columns: { id: true },
  });

  if (!order) {
    throw new BadRequestException("Order not found");
  }

  const key = `orders/${orderId}/pickup/${crypto.randomUUID()}`;
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
      image_path: body.image_path,
      note: body.note ?? null,
      uploaded_by: user.id,
    })
    .returning();

  return {
    ...photo,
    image_url: buildMediaUrl(photo.image_path),
  };
}

export async function saveOrderDropoffPhoto({
  orderId,
  body,
  user,
}: {
  orderId: number;
  body: PutOrderDropoffPhotoInput;
  user: JWTPayload;
}) {
  const [order] = await db
    .update(ordersTable)
    .set({
      dropoff_photo_path: body.image_path,
      dropoff_photo_uploaded_at: new Date(),
      dropoff_photo_uploaded_by: user.id,
      updated_by: user.id,
    })
    .where(eq(ordersTable.id, orderId))
    .returning({
      id: ordersTable.id,
      dropoff_photo_uploaded_at: ordersTable.dropoff_photo_uploaded_at,
      dropoff_photo_path: ordersTable.dropoff_photo_path,
    });

  if (!order) {
    throw new BadRequestException("Order not found");
  }

  return {
    id: order.id,
    dropoff_photo_uploaded_at: order.dropoff_photo_uploaded_at,
    dropoff_photo_url: buildMediaUrl(order.dropoff_photo_path),
  };
}

export async function createOrderPickupEvent({
  orderId,
  body,
  user,
}: {
  orderId: number;
  body: PostOrderPickupEventInput;
  user: JWTPayload;
}) {
  assertCanProcessPickup(user);

  const uniqueServiceIds = Array.from(new Set(body.service_ids));
  if (uniqueServiceIds.length === 0) {
    throw new BadRequestException("At least one service must be picked up");
  }

  const order = await db.query.ordersTable.findFirst({
    where: { id: orderId },
    columns: { id: true },
  });

  if (!order) {
    throw new BadRequestException("Order not found");
  }

  const candidateServices = await db.query.ordersServicesTable.findMany({
    where: {
      order_id: orderId,
      id: { in: uniqueServiceIds },
    },
    columns: {
      id: true,
      item_code: true,
      status: true,
    },
  });

  if (candidateServices.length !== uniqueServiceIds.length) {
    throw new BadRequestException(
      "One or more services do not belong to this order"
    );
  }

  const notReady = candidateServices.filter(
    (service) => service.status !== "ready_for_pickup"
  );
  if (notReady.length > 0) {
    throw new BadRequestException(
      `Services not ready for pickup: ${notReady
        .map((service) => service.item_code ?? String(service.id))
        .join(", ")}`
    );
  }

  const [pickupEvent] = await db
    .insert(orderPickupEventsTable)
    .values({
      order_id: orderId,
      image_path: body.image_path,
      picked_up_by: user.id,
    })
    .returning({
      id: orderPickupEventsTable.id,
      picked_up_at: orderPickupEventsTable.picked_up_at,
    });

  // Race guard: only flip rows still in ready_for_pickup. If the count
  // drops, another cashier already claimed a service — compensate by
  // rolling back the pickup event we just inserted.
  const flipped = await db
    .update(ordersServicesTable)
    .set({ status: "picked_up", pickup_event_id: pickupEvent.id })
    .where(
      and(
        eq(ordersServicesTable.order_id, orderId),
        inArray(ordersServicesTable.id, uniqueServiceIds),
        eq(ordersServicesTable.status, "ready_for_pickup")
      )
    )
    .returning({ id: ordersServicesTable.id });

  if (flipped.length !== uniqueServiceIds.length) {
    // Compensating rollback (neon-http has no transactions). The CHECK
    // constraint pairs status<->pickup_event_id, so we flip rows back
    // before deleting the event. If rollback itself fails we surface a
    // 500 so the orphaned state is visible instead of masked by the 400.
    try {
      if (flipped.length > 0) {
        await db
          .update(ordersServicesTable)
          .set({ status: "ready_for_pickup", pickup_event_id: null })
          .where(eq(ordersServicesTable.pickup_event_id, pickupEvent.id));
      }
      await db
        .delete(orderPickupEventsTable)
        .where(eq(orderPickupEventsTable.id, pickupEvent.id));
    } catch (rollbackError) {
      throw new Error(
        `Pickup rollback failed for event ${pickupEvent.id}: ${
          rollbackError instanceof Error
            ? rollbackError.message
            : String(rollbackError)
        }`
      );
    }
    throw new BadRequestException(
      "Another cashier already processed one of the selected items. Refresh and try again."
    );
  }

  await db.insert(orderServiceStatusLogsTable).values(
    candidateServices.map((service) => ({
      order_service_id: service.id,
      from_status: "ready_for_pickup" as const,
      to_status: "picked_up" as const,
      changed_by: user.id,
      note: "Completed from order pickup desk",
    }))
  );

  await recalculateOrderStatusDirect(orderId, user.id);

  return {
    id: pickupEvent.id,
    image_url: buildMediaUrl(body.image_path),
    order_id: orderId,
    picked_up_at: pickupEvent.picked_up_at,
    service_ids: uniqueServiceIds,
  };
}

async function recalculateOrderStatusDirect(
  orderId: number,
  updatedBy: number
) {
  const [services, productCount] = await Promise.all([
    db.query.ordersServicesTable.findMany({
      where: { order_id: orderId },
      columns: { status: true },
    }),
    db.$count(ordersProductsTable, eq(ordersProductsTable.order_id, orderId)),
  ]);

  const nextStatus = deriveOrderStatus(services, productCount);

  await db
    .update(ordersTable)
    .set({
      status: nextStatus,
      completed_at: nextStatus === "completed" ? new Date() : null,
      updated_by: updatedBy,
    })
    .where(eq(ordersTable.id, orderId));
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
    where: { id: orderId },
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
    where: { order_id: orderId, id: { in: uniqueServiceIds } },
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

    await recalculateOrderStatus(tx, orderId, user.id);

    return [createdRefund] as const;
  });

  return {
    refund,
    total_refund_amount: totalRefundAmount,
  };
}
