import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  lte,
  notInArray,
  sql,
} from "drizzle-orm";
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
import type { OrderTx } from "@/modules/orders/order.repository";
import type {
  GetMyOrderServicesQuery,
  GetOrderServiceQueueQuery,
  PatchOrderServiceHandlerInput,
  PatchOrderServiceStatusInput,
} from "@/modules/orders/order-admin.schema";
import { normalizeOrderServiceQueueQuery } from "@/modules/orders/order-admin.schema";
import { isNumericSearch } from "@/modules/orders/order-search";
import {
  isTerminalOrderServiceStatus,
  ORDER_TERMINAL_SERVICE_STATUSES,
  transitionOrderService,
} from "@/modules/orders/order-status-machine";
import { assertCanReassignHandler } from "@/modules/permissions/permissions";
import type { JWTPayload } from "@/types";
import type { OrderService } from "@/types/entity";
import { assertStoreAccess, getUserStoreIds } from "@/utils/authorization";
import { jakartaDayEnd, jakartaDayStart } from "@/utils/date";
import { buildPaginationMeta } from "@/utils/pagination";

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
      notInArray(ordersServicesTable.status, [
        ...ORDER_TERMINAL_SERVICE_STATUSES,
      ])
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
    notInArray(ordersServicesTable.status, [
      ...ORDER_TERMINAL_SERVICE_STATUSES,
    ]),
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

    if (isNumericSearch(search)) {
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

interface ClaimHandlerInput {
  lockedOrderService: OrderService;
  note: string;
  user: JWTPayload;
}

// Two scanners can hit the same tag at once, and only one of them may end up
// holding the garment.
async function lockOrderServiceOrThrow(
  tx: OrderTx,
  orderId: number,
  serviceId: number
) {
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

  return locked;
}

// The hand-off log is what the shop reads when a garment goes missing. Picking up
// an item you already hold changes nothing — a second row would invent a hand-off
// that never happened.
async function claimHandler(
  tx: OrderTx,
  { lockedOrderService, note, user }: ClaimHandlerInput
) {
  if (lockedOrderService.handler_id === user.id) {
    return;
  }

  await tx
    .update(ordersServicesTable)
    .set({ handler_id: user.id })
    .where(eq(ordersServicesTable.id, lockedOrderService.id));

  await tx.insert(orderServiceHandlerLogsTable).values({
    order_service_id: lockedOrderService.id,
    from_handler_id: lockedOrderService.handler_id,
    to_handler_id: user.id,
    changed_by: user.id,
    note,
  });
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
    const locked = await lockOrderServiceOrThrow(tx, orderId, serviceId);

    if (
      locked.handler_id !== null &&
      locked.handler_id !== undefined &&
      locked.handler_id !== user.id
    ) {
      throw new ForbiddenException(
        "This item is already assigned to another staff member"
      );
    }

    await claimHandler(tx, {
      note: "Started from queue",
      lockedOrderService: locked,
      user,
    });

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

  await db.transaction(async (tx) => {
    // Who held the garment has to be read under the lock: two managers
    // reassigning at once would otherwise both log the same previous handler,
    // and the trail could no longer say who to ask when an item goes missing.
    const orderService = await lockOrderServiceOrThrow(tx, orderId, serviceId);

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
    const locked = await lockOrderServiceOrThrow(tx, orderId, serviceId);

    // Restarting work on a queued or QC-rejected item means the person doing it
    // now owns it — the worker who dropped it may have gone home.
    const isClaimTransition =
      (locked.status === "queued" || locked.status === "qc_reject") &&
      body.status === "processing";

    if (isClaimTransition) {
      await claimHandler(tx, {
        note: "Auto-assigned on status update",
        lockedOrderService: locked,
        user,
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
