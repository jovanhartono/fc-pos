import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  orderServiceHandlerLogsTable,
  orderServicesImagesTable,
  ordersServicesTable,
  ordersTable,
  servicesTable,
  storesTable,
  usersTable,
} from "@/db/schema";
import { BadRequestException, ForbiddenException } from "@/errors";
import { softDeleteOrderServiceImageById } from "@/modules/order-service-images/order-service-image.repository";
import type {
  GetMyOrderServicesQuery,
  GetOrderServiceQueueQuery,
  PatchOrderPaymentInput,
  PatchOrderServiceHandlerInput,
  PatchOrderServiceStatusInput,
  PostOrderDropoffPhotoPresignInput,
  PostOrderServicePhotoInput,
  PostOrderServicePhotoPresignInput,
  PutOrderDropoffPhotoInput,
} from "@/modules/orders/order-admin.schema";
import { normalizeOrderServiceQueueQuery } from "@/modules/orders/order-admin.schema";
import { deriveOrderRefundStatus } from "@/modules/orders/order-refund-status";
import {
  isTerminalOrderServiceStatus,
  summarizeOrderFulfillment,
  transitionOrderService,
} from "@/modules/orders/order-status-machine";
import {
  assertCanProcessPayment,
  assertCanReassignHandler,
} from "@/modules/permissions/permissions";
import type { JWTPayload } from "@/types";
import { assertStoreAccess, getUserStoreIds } from "@/utils/authorization";
import { jakartaDayEnd, jakartaDayStart } from "@/utils/date";
import { buildPaginationMeta } from "@/utils/pagination";
import { buildMediaUrl, createPresignedUploadUrl } from "@/utils/s3";

const numericSearchRegex = /^\d+$/;

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
  } else if (query.store_id === undefined) {
    const storeIds = await getUserStoreIds(user.id);
    if (storeIds.length === 0) {
      return [];
    }

    conditions.push(inArray(ordersTable.store_id, storeIds));
  } else {
    await assertStoreAccess(user, query.store_id);
    conditions.push(eq(ordersTable.store_id, query.store_id));
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
  } else if (normalized.store_id === undefined) {
    const storeIds = await getUserStoreIds(user.id);
    if (storeIds.length === 0) {
      return {
        items: [],
        meta: buildPaginationMeta(0, normalized),
      };
    }

    conditions.push(inArray(ordersTable.store_id, storeIds));
  } else {
    await assertStoreAccess(user, normalized.store_id);
    conditions.push(eq(ordersTable.store_id, normalized.store_id));
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
      gte(ordersTable.created_at, jakartaDayStart(normalized.date_from))
    );
  }

  if (normalized.date_to) {
    conditions.push(
      lte(ordersTable.created_at, jakartaDayEnd(normalized.date_to))
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
            where: { deleted_at: { isNull: true } },
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

  const { pickup_code: _pickup_code, ...detailWithoutPickupCode } = detail;

  return {
    ...detailWithoutPickupCode,
    dropoff_photo_url: buildMediaUrl(detail.dropoff_photo_path),
    refund_status: deriveOrderRefundStatus({
      paid_amount: detail.paid_amount,
      refunded_amount: detail.refunded_amount,
    }),
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
  assertCanProcessPayment(user);

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
  const result = await db.transaction(async (tx) => {
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

    if (
      locked.handler_id !== null &&
      locked.handler_id !== undefined &&
      locked.handler_id !== user.id
    ) {
      throw new ForbiddenException(
        "This item is already assigned to another staff member"
      );
    }

    if (locked.handler_id !== user.id) {
      await tx
        .update(ordersServicesTable)
        .set({ handler_id: user.id })
        .where(eq(ordersServicesTable.id, serviceId));

      await tx.insert(orderServiceHandlerLogsTable).values({
        order_service_id: serviceId,
        from_handler_id: locked.handler_id,
        to_handler_id: user.id,
        changed_by: user.id,
        note: "Started from queue",
      });
    }

    const { from } = await transitionOrderService(tx, {
      orderId,
      serviceId,
      to: "processing",
      by: user.id,
      note: "Started from queue",
    });

    return { from };
  });

  return {
    from_status: result.from,
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
  assertCanReassignHandler(user);

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
  if (isTerminalOrderServiceStatus(body.status)) {
    throw new ForbiddenException(
      body.status === "picked_up"
        ? "Use the pickup endpoint to record pickups"
        : "Use the cancel or refund endpoint for terminal exit states"
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

    const isClaimTransition =
      (locked.status === "queued" || locked.status === "qc_reject") &&
      body.status === "processing";
    const needsHandlerAssign =
      isClaimTransition && locked.handler_id !== user.id;

    if (needsHandlerAssign) {
      await tx
        .update(ordersServicesTable)
        .set({ handler_id: user.id })
        .where(eq(ordersServicesTable.id, serviceId));

      await tx.insert(orderServiceHandlerLogsTable).values({
        order_service_id: serviceId,
        from_handler_id: locked.handler_id,
        to_handler_id: user.id,
        changed_by: user.id,
        note: "Auto-assigned on status update",
      });
    }

    const { from } = await transitionOrderService(tx, {
      orderId,
      serviceId,
      to: body.status,
      by: user.id,
      note: body.note,
      cancelReason: body.cancel_reason,
      cancelNote: body.cancel_note?.trim() || null,
    });

    return from;
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

export async function deleteOrderServicePhoto({
  orderId,
  serviceId,
  photoId,
  user,
}: {
  orderId: number;
  serviceId: number;
  photoId: number;
  user: JWTPayload;
}) {
  await getOrderServiceOrThrow(orderId, serviceId);

  const photo = await db.query.orderServicesImagesTable.findFirst({
    where: {
      id: photoId,
      order_service_id: serviceId,
      deleted_at: { isNull: true },
    },
    columns: { id: true, uploaded_by: true },
  });

  if (!photo) {
    throw new BadRequestException("Photo not found");
  }

  if (user.role !== "admin" && photo.uploaded_by !== user.id) {
    throw new ForbiddenException(
      "Only the uploader or an admin can delete this photo"
    );
  }

  const [deleted] = await softDeleteOrderServiceImageById(photoId, user.id);
  if (!deleted) {
    throw new BadRequestException("Photo already deleted");
  }

  return { id: deleted.id };
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
