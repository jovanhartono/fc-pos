import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  orderServiceHandlerLogsTable,
  ordersServicesTable,
  ordersTable,
  servicesTable,
  storesTable,
  usersTable,
} from "@/db/schema";
import { BadRequestException, ForbiddenException } from "@/errors";
import { getOrderServiceOrThrow } from "@/modules/orders/order.repository";
import type {
  GetMyOrderServicesQuery,
  GetOrderServiceQueueQuery,
  PatchOrderServiceHandlerInput,
  PatchOrderServiceStatusInput,
} from "@/modules/orders/order-admin.schema";
import { normalizeOrderServiceQueueQuery } from "@/modules/orders/order-admin.schema";
import {
  isTerminalOrderServiceStatus,
  transitionOrderService,
} from "@/modules/orders/order-status-machine";
import { assertCanReassignHandler } from "@/modules/permissions/permissions";
import type { JWTPayload } from "@/types";
import { assertStoreAccess, getUserStoreIds } from "@/utils/authorization";
import { jakartaDayEnd, jakartaDayStart } from "@/utils/date";
import { buildPaginationMeta } from "@/utils/pagination";

const numericSearchRegex = /^\d+$/;

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
