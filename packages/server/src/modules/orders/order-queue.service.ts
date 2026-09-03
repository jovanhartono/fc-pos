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

// Scanning a tag now finds an object, not a job: one code can front several
// treatments (ADR-0017). Its live treatments come back with it so the caller
// can send a worker straight to the only open one, or make them choose.
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
      // A tag on the shelf points at work still to do, so terminal treatments
      // are filtered in the query rather than fetched and dropped.
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
    // A worker with no branch yet has no rack to show.
    case "none":
      return [];
    // An admin who named no branch sees their own items across every branch —
    // this is one person's rack, so it is never the whole company's floor.
    case "all":
      break;
    default:
      return unhandledStoreScope(scope);
  }

  // Stays one row per treatment: this is the rack of jobs one worker is
  // holding, not the shelf of objects waiting. The Item's tag and descriptors
  // ride along so the row can still name what is in their hands (ADR-0017).
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

// Null means "no branch assigned" — an empty queue, not an unscoped one.
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

  // An object is on the rack while something on it still needs the workshop.
  // One whose every live treatment is ready belongs to the counter, not here.
  const conditions = [
    inArray(ordersServicesTable.status, [...WORKSHOP_SERVICE_STATUSES]),
    storeCondition,
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

  // The page unit is the object, not the treatment (ADR-0017). Paginating
  // treatments and grouping in the browser would split one shoe's card across
  // a page boundary — two half-cards for one object on the shelf.
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
        // An object is urgent if any treatment on it is: the shoe is on the
        // priority shelf, not one of the three jobs written against it.
        is_priority: sql<boolean>`bool_or(${ordersServicesTable.is_priority})`,
      })
      .from(ordersServicesTable)
      .innerJoin(itemsTable, eq(ordersServicesTable.item_id, itemsTable.id))
      .innerJoin(ordersTable, eq(ordersServicesTable.order_id, ordersTable.id))
      .innerJoin(storesTable, eq(ordersTable.store_id, storesTable.id))
      .innerJoin(customersTable, eq(ordersTable.customer_id, customersTable.id))
      .where(whereClause)
      // Grouped by the customer's id, not their name: the id is the PK, so the
      // name rides along as a dependent column and the hash key stays narrow.
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
      .where(whereClause),
  ]);

  // Second pass for the treatments themselves. Deliberately NOT filtered by
  // the status chip, and it keeps ready siblings: a card claiming to be one
  // object has to show every live job on it, or a worker filtered to "Queued"
  // would start a repaint without seeing the clean already done on the same
  // shoe.
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

  // Deliberately no rolled-up Item status here. The card shows a badge per
  // treatment — which is what a worker acts on — and deriving one from this
  // page's non-terminal rows would disagree with the order detail, which rolls
  // up over every sibling including the cancelled ones.
  return {
    items: itemRows.map((item) => ({
      ...item,
      services: servicesByItem.get(item.id) ?? [],
    })),
    meta: buildPaginationMeta(Number(countRows[0]?.total ?? 0), normalized),
  };
}

// Branch-scoped only, deliberately: honouring the date range too would just
// count what is already on screen.
export async function getOrderServiceQueueCounts(
  user: JWTPayload,
  query?: GetOrderServiceQueueCountsQuery
) {
  const storeCondition = await resolveQueueStoreCondition(
    user,
    query?.store_id
  );

  // A worker with no branch yet: an empty rack, not the company's.
  if (storeCondition === null) {
    return {
      all: 0,
      queued: 0,
      processing: 0,
      quality_check: 0,
      qc_reject: 0,
    };
  }

  // Counts objects, not treatments, because the queue below lists objects — a
  // chip reading 12 has to open onto 12 cards. One shoe with a clean queued and
  // a repaint in progress is therefore counted under both chips, and the chips
  // legitimately sum to more than `all`: they are filters, not a partition.
  // Every chip in one pass. Named by hand rather than mapped over the enum: a
  // new workshop status must be given a chip on purpose rather than counted
  // into nothing.
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
        storeCondition
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
