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
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import {
  complaintsTable,
  customersTable,
  itemsTable,
  orderServiceHandlerLogsTable,
  ordersServicesTable,
  ordersTable,
  servicesTable,
  storesTable,
  usersTable,
} from "@/db/schema";
import { BadRequestException, ForbiddenException } from "@/http-exceptions";
import type { OrderTx } from "@/modules/orders/order.repository";
import type {
  GetMyOrderServicesQuery,
  GetOrderServiceQueueCountsQuery,
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
  WORKSHOP_SERVICE_STATUSES,
} from "@/modules/orders/order-status-machine";
import { assertCanReassignHandler } from "@/modules/permissions/permissions";
import { toStoredPhonePrefix } from "@/schema/phone";
import type { JWTPayload } from "@/types";
import type { OrderService } from "@/types/entity";
import { resolveStoreScope, unhandledStoreScope } from "@/utils/authorization";
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

// One Item code can cover several lines (ADR-0017). Its live lines come back with
// it so a worker who scans the tag goes straight to the only open one, or chooses.
const getItemByItemCodePrepared = db.query.itemsTable
  .findFirst({
    where: { item_code: { eq: sql.placeholder("item_code") } },
    with: {
      order: {
        columns: {
          id: true,
          code: true,
          store_id: true,
          status: true,
        },
      },
      services: {
        columns: {
          id: true,
          status: true,
        },
        where: { status: { notIn: [...ORDER_TERMINAL_SERVICE_STATUSES] } },
        orderBy: { id: "asc" },
      },
    },
  })
  .prepare("get_item_by_item_code");

const getOrderServiceByIdPrepared = db.query.ordersServicesTable
  .findFirst({
    where: { id: { eq: sql.placeholder("id") } },
    with: queueRelationColumns,
  })
  .prepare("get_order_service_by_id");

export function getItemByItemCode(item_code: string) {
  return getItemByItemCodePrepared.execute({ item_code });
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

  const scope = await resolveStoreScope(user, query.store_id);

  switch (scope.kind) {
    case "one":
      conditions.push(eq(ordersTable.store_id, scope.storeId));
      break;
    case "some":
      conditions.push(inArray(ordersTable.store_id, scope.storeIds));
      break;
    case "none":
      return [];
    // An admin who picked no Store sees their own lines across every Store.
    case "all":
      break;
    default:
      return unhandledStoreScope(scope);
  }

  // One row per line, not per Item: these are the lines one worker is holding
  // (ADR-0017).
  return db
    .select({
      brand: itemsTable.brand,
      color: itemsTable.color,
      handler_id: ordersServicesTable.handler_id,
      id: ordersServicesTable.id,
      is_priority: ordersServicesTable.is_priority,
      item_code: itemsTable.item_code,
      item_id: itemsTable.id,
      model: itemsTable.model,
      order_code: ordersTable.code,
      order_created_at: ordersTable.created_at,
      order_id: ordersTable.id,
      service_code: servicesTable.code,
      service_name: servicesTable.name,
      size: itemsTable.size,
      status: ordersServicesTable.status,
      store_code: storesTable.code,
      store_id: storesTable.id,
      store_name: storesTable.name,
    })
    .from(ordersServicesTable)
    .innerJoin(itemsTable, eq(ordersServicesTable.item_id, itemsTable.id))
    .innerJoin(ordersTable, eq(ordersServicesTable.order_id, ordersTable.id))
    .innerJoin(storesTable, eq(ordersTable.store_id, storesTable.id))
    .innerJoin(
      servicesTable,
      eq(ordersServicesTable.service_id, servicesTable.id)
    )
    .where(and(...conditions))
    .orderBy(asc(ordersServicesTable.id));
}

// The repairer reads "Repair only", the cleaners "everything except Repair".
// Checked per line, so a shoe in for both shows on both Queues.
function queueCategoryCondition(
  query?: Pick<GetOrderServiceQueueQuery, "category_id" | "category_mode">
) {
  if (query?.category_id === undefined) {
    return;
  }

  const servicesInCategory = db
    .select({ id: servicesTable.id })
    .from(servicesTable)
    .where(eq(servicesTable.category_id, query.category_id));

  return query.category_mode === "except"
    ? notInArray(ordersServicesTable.service_id, servicesInCategory)
    : inArray(ordersServicesTable.service_id, servicesInCategory);
}

// Null means "no Store assigned": an empty Queue, not every Store's.
async function resolveQueueStoreCondition(user: JWTPayload, storeId?: number) {
  const scope = await resolveStoreScope(user, storeId);

  switch (scope.kind) {
    case "one":
      return eq(ordersTable.store_id, scope.storeId);
    case "some":
      return inArray(ordersTable.store_id, scope.storeIds);
    case "none":
      return null;
    case "all":
      throw new BadRequestException("Store is required for admin queue access");
    default:
      return unhandledStoreScope(scope);
  }
}

export async function getOrderServiceQueue(
  user: JWTPayload,
  query?: GetOrderServiceQueueQuery
) {
  const normalized = normalizeOrderServiceQueueQuery(query);
  const storeCondition = await resolveQueueStoreCondition(
    user,
    normalized.store_id
  );

  if (storeCondition === null) {
    return {
      items: [],
      meta: buildPaginationMeta(0, normalized),
    };
  }

  const conditions = [
    inArray(ordersServicesTable.status, [...WORKSHOP_SERVICE_STATUSES]),
    storeCondition,
    queueCategoryCondition(normalized),
  ];

  if (normalized.status !== undefined) {
    conditions.push(eq(ordersServicesTable.status, normalized.status));
  }

  if (normalized.search) {
    const search = normalized.search.trim();
    const loweredSearchPrefix = `${search.toLowerCase()}%`;
    const searchConditions = [
      sql`LOWER(${ordersTable.code}) LIKE ${loweredSearchPrefix}`,
      sql`LOWER(${itemsTable.item_code}) LIKE ${loweredSearchPrefix}`,
      sql`LOWER(${customersTable.name}) LIKE ${loweredSearchPrefix}`,
      sql`${customersTable.phone_number} LIKE ${`${toStoredPhonePrefix(search)}%`}`,
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

  // Pages count Items, not lines (ADR-0017), or one shoe's card could split
  // across two pages.
  const [itemRows, countRows] = await Promise.all([
    db
      .select({
        brand: itemsTable.brand,
        color: itemsTable.color,
        // Workers know regulars by name before they know the tag.
        customer_name: customersTable.name,
        id: itemsTable.id,
        item_code: itemsTable.item_code,
        model: itemsTable.model,
        order_code: ordersTable.code,
        order_created_at: ordersTable.created_at,
        order_id: ordersTable.id,
        size: itemsTable.size,
        store_code: storesTable.code,
        store_id: storesTable.id,
        store_name: storesTable.name,
        // An Item is Priority if any line on it is.
        is_priority: sql<boolean>`bool_or(${ordersServicesTable.is_priority})`,
      })
      .from(ordersServicesTable)
      .innerJoin(itemsTable, eq(ordersServicesTable.item_id, itemsTable.id))
      .innerJoin(ordersTable, eq(ordersServicesTable.order_id, ordersTable.id))
      .innerJoin(storesTable, eq(ordersTable.store_id, storesTable.id))
      .innerJoin(customersTable, eq(ordersTable.customer_id, customersTable.id))
      .where(whereClause)
      // Grouped by the Customer's id, not name: the id is the primary key, so the
      // name comes along without widening the grouping.
      .groupBy(
        customersTable.id,
        itemsTable.id,
        itemsTable.brand,
        itemsTable.color,
        itemsTable.item_code,
        itemsTable.model,
        itemsTable.size,
        ordersTable.code,
        ordersTable.created_at,
        ordersTable.id,
        storesTable.code,
        storesTable.id,
        storesTable.name
      )
      .orderBy(
        desc(sql`bool_or(${ordersServicesTable.is_priority})`),
        asc(ordersTable.created_at),
        asc(itemsTable.id)
      )
      .limit(normalized.limit)
      .offset(normalized.offset),
    db
      .select({
        total: sql<number>`count(DISTINCT ${ordersServicesTable.item_id})`,
      })
      .from(ordersServicesTable)
      .innerJoin(itemsTable, eq(ordersServicesTable.item_id, itemsTable.id))
      .innerJoin(ordersTable, eq(ordersServicesTable.order_id, ordersTable.id))
      .innerJoin(customersTable, eq(ordersTable.customer_id, customersTable.id))
      .where(whereClause),
  ]);

  // Not filtered by the status chip, and ready lines stay: a worker filtered to
  // "Queued" must still see the clean already done before starting a repaint.
  // A Rework line sits under the line it redoes as "Rework 2", so the worker sees
  // which treatment the Customer turned down.
  const originalLine = alias(ordersServicesTable, "original_line");
  const originalService = alias(servicesTable, "original_service");
  // Counted over every round: rounds already picked up are off the card but
  // still came first.
  const earlierRound = alias(ordersServicesTable, "earlier_round");
  const roundsSoFar = db
    .select({ rounds: sql<number>`count(*)::int` })
    .from(earlierRound)
    .where(
      and(
        eq(earlierRound.complaint_id, ordersServicesTable.complaint_id),
        lte(earlierRound.id, ordersServicesTable.id)
      )
    );
  const services =
    itemRows.length === 0
      ? []
      : await db
          .select({
            handler_id: ordersServicesTable.handler_id,
            handler_name: usersTable.name,
            id: ordersServicesTable.id,
            is_priority: ordersServicesTable.is_priority,
            item_id: ordersServicesTable.item_id,
            rework_of_line_id: complaintsTable.order_service_id,
            rework_of_service_name: originalService.name,
            rework_round: sql<
              number | null
            >`CASE WHEN ${ordersServicesTable.complaint_id} IS NULL THEN NULL ELSE (${roundsSoFar}) END`,
            service_name: servicesTable.name,
            status: ordersServicesTable.status,
          })
          .from(ordersServicesTable)
          .innerJoin(
            servicesTable,
            eq(ordersServicesTable.service_id, servicesTable.id)
          )
          .leftJoin(
            usersTable,
            eq(ordersServicesTable.handler_id, usersTable.id)
          )
          .leftJoin(
            complaintsTable,
            eq(ordersServicesTable.complaint_id, complaintsTable.id)
          )
          .leftJoin(
            originalLine,
            eq(complaintsTable.order_service_id, originalLine.id)
          )
          .leftJoin(
            originalService,
            eq(originalLine.service_id, originalService.id)
          )
          .where(
            and(
              inArray(
                ordersServicesTable.item_id,
                itemRows.map((item) => item.id)
              ),
              notInArray(ordersServicesTable.status, [
                ...ORDER_TERMINAL_SERVICE_STATUSES,
              ])
            )
          )
          .orderBy(asc(ordersServicesTable.id));

  const servicesByItem = Map.groupBy(services, (service) => service.item_id);

  // No Item status here: built from live lines only, it would disagree with the
  // Order detail, which also counts cancelled ones.
  return {
    items: itemRows.map((item) => ({
      ...item,
      services: servicesByItem.get(item.id) ?? [],
    })),
    meta: buildPaginationMeta(Number(countRows[0]?.total ?? 0), normalized),
  };
}

// Store and Category only: the date range would just count what is already on
// screen, while the Category is the Queue the worker is standing at.
export async function getOrderServiceQueueCounts(
  user: JWTPayload,
  query?: GetOrderServiceQueueCountsQuery
) {
  const storeCondition = await resolveQueueStoreCondition(
    user,
    query?.store_id
  );

  if (storeCondition === null) {
    return {
      all: 0,
      queued: 0,
      processing: 0,
      quality_check: 0,
      qc_reject: 0,
    };
  }

  // Counts Items, so a chip reading 12 opens onto 12 cards. A shoe with a clean
  // queued and a repaint in progress counts under both, so chips can sum past `all`.
  // Named by hand so a new workshop status gets a chip on purpose.
  const chip = (status: OrderService["status"]) =>
    sql<number>`count(DISTINCT ${ordersServicesTable.item_id}) FILTER (WHERE ${ordersServicesTable.status} = ${status})`;

  const [row] = await db
    .select({
      all: sql<number>`count(DISTINCT ${ordersServicesTable.item_id})`,
      queued: chip("queued"),
      processing: chip("processing"),
      quality_check: chip("quality_check"),
      qc_reject: chip("qc_reject"),
    })
    .from(ordersServicesTable)
    .innerJoin(ordersTable, eq(ordersServicesTable.order_id, ordersTable.id))
    .where(
      and(
        inArray(ordersServicesTable.status, [...WORKSHOP_SERVICE_STATUSES]),
        storeCondition,
        queueCategoryCondition(query)
      )
    );

  return {
    all: Number(row?.all ?? 0),
    queued: Number(row?.queued ?? 0),
    processing: Number(row?.processing ?? 0),
    quality_check: Number(row?.quality_check ?? 0),
    qc_reject: Number(row?.qc_reject ?? 0),
  };
}

interface ClaimHandlerInput {
  lockedOrderService: OrderService;
  note: string;
  user: JWTPayload;
}

// Two workers can scan the same tag at once; only one may end up holding the Item.
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

// The shop reads the hand-off log when an Item goes missing, so taking one you
// already hold must not log a hand-off that never happened.
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
    // Read under the lock: two admins reassigning at once would both log the same
    // previous Handler, and the trail could not say who to ask when an Item goes missing.
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

    // Whoever restarts a queued or QC-rejected line now holds it; the worker who
    // left it may have gone home.
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
