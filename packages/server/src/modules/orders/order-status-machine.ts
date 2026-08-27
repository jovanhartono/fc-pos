import { and, eq, inArray, sql } from "drizzle-orm";
import type { db } from "@/db";
import {
  type cancelReasonEnum,
  type orderServiceStatusEnum,
  orderServiceStatusLogsTable,
  ordersServicesTable,
  ordersTable,
} from "@/db/schema";
import { BadRequestException } from "@/http-exceptions";
import type { OrderTx } from "@/modules/orders/order.repository";

export type OrderServiceStatus =
  (typeof orderServiceStatusEnum.enumValues)[number];

type CancelReason = (typeof cancelReasonEnum.enumValues)[number];

export type DbExecutor = typeof db | OrderTx;

type DerivedOrderStatus =
  | "created"
  | "processing"
  | "ready_for_pickup"
  | "completed"
  | "cancelled";

export const ORDER_TERMINAL_SERVICE_STATUSES = [
  "picked_up",
  "refunded",
  "cancelled",
] as const;

const ORDER_TERMINAL_SERVICE_STATUS_SET = new Set<OrderServiceStatus>(
  ORDER_TERMINAL_SERVICE_STATUSES
);

export function isTerminalOrderServiceStatus(status: OrderServiceStatus) {
  return ORDER_TERMINAL_SERVICE_STATUS_SET.has(status);
}

export const ORDER_SERVICE_TRANSITIONS: Record<
  OrderServiceStatus,
  OrderServiceStatus[]
> = {
  queued: ["processing", "cancelled", "refunded"],
  processing: ["quality_check", "cancelled", "refunded"],
  quality_check: ["qc_reject", "ready_for_pickup", "cancelled", "refunded"],
  qc_reject: ["processing", "cancelled", "refunded"],
  ready_for_pickup: ["picked_up", "refunded", "cancelled"],
  picked_up: ["refunded"],
  refunded: [],
  cancelled: [],
};

export interface OrderFulfillmentSummary {
  active_count: number;
  is_partially_picked_up: boolean;
  is_ready_for_pickup: boolean;
  picked_up_count: number;
  ready_for_pickup_count: number;
  remaining_count: number;
  service_total_count: number;
  terminal_count: number;
}

export function summarizeOrderFulfillment(
  statuses: OrderServiceStatus[]
): OrderFulfillmentSummary {
  const service_total_count = statuses.length;
  const ready_for_pickup_count = statuses.filter(
    (status) => status === "ready_for_pickup"
  ).length;
  const picked_up_count = statuses.filter(
    (status) => status === "picked_up"
  ).length;
  const terminal_count = statuses.filter((status) =>
    isTerminalOrderServiceStatus(status)
  ).length;
  const active_count = service_total_count - terminal_count;
  const remaining_count = Math.max(active_count - ready_for_pickup_count, 0);

  return {
    active_count,
    is_partially_picked_up: picked_up_count > 0 && active_count > 0,
    is_ready_for_pickup: active_count > 0 && remaining_count === 0,
    picked_up_count,
    ready_for_pickup_count,
    remaining_count,
    service_total_count,
    terminal_count,
  };
}

// What an Item is doing, rolled up from the treatments applied to it. Derived
// on read and never stored: an Item is only ever loaded beside its own
// treatments, so a column would be a second copy of the truth with nothing to
// gain from it. `queued` stands where an Order reads `created`, `picked_up`
// where it reads `completed`. See ADR-0017.
export type DerivedItemStatus =
  | "queued"
  | "processing"
  | "ready_for_pickup"
  | "picked_up"
  | "cancelled";

// An Item rolls up exactly like an Order — same branches, same reading of a
// cancelled sibling — so it *is* the Order rollup, renamed into treatment
// vocabulary rather than restated. Writing the branches out a second time
// would mean hand-syncing two copies every time a transition changes.
const ITEM_STATUS_FOR: Record<DerivedOrderStatus, DerivedItemStatus> = {
  created: "queued",
  processing: "processing",
  ready_for_pickup: "ready_for_pickup",
  completed: "picked_up",
  cancelled: "cancelled",
};

export function deriveItemStatus(
  services: { status: OrderServiceStatus }[]
): DerivedItemStatus {
  return ITEM_STATUS_FOR[deriveOrderStatus(services, [])];
}

// You cannot hand back half an object: an Item leaves the counter only once
// every treatment still live on it is ready. A cancelled sibling does not hold
// the object hostage — the shop is never going to do that work — and that
// reading comes free by asking the rollup rather than re-deriving it.
export function isItemCollectable(
  services: { status: OrderServiceStatus }[]
): boolean {
  return deriveItemStatus(services) === "ready_for_pickup";
}

export function deriveOrderStatus(
  services: { status: OrderServiceStatus }[],
  products: { cancelled_at: Date | null }[]
): DerivedOrderStatus {
  const activeServices = services.filter(
    (item) => !isTerminalOrderServiceStatus(item.status)
  );

  // Active work comes only from services (products have no processing axis).
  if (activeServices.length > 0) {
    if (activeServices.every((item) => item.status === "ready_for_pickup")) {
      return "ready_for_pickup";
    }
    // Has anything actually been worked on? A cancelled line is work the shop
    // will never do, so it is no evidence that anyone started — the customer
    // who dropped the treatment at the counter must still see the rest of the
    // rack as queued. Every other terminal line (picked_up, refunded) IS
    // evidence: that work happened and left.
    if (
      services.some(
        (item) => item.status !== "queued" && item.status !== "cancelled"
      )
    ) {
      return "processing";
    }
    return "created";
  }

  // No active services: roll up over every terminal line — services and products.
  if (services.length + products.length === 0) {
    return "created";
  }

  const everyServiceCancelled = services.every(
    (item) => item.status === "cancelled"
  );
  const everyProductCancelled = products.every(
    (item) => item.cancelled_at != null
  );
  if (everyServiceCancelled && everyProductCancelled) {
    return "cancelled";
  }

  return "completed";
}

// What the customer still owes. Cancelled work drops off the bill — the shop
// never did it. Refunded work stays on: it was done and handed over, and the
// refund is already recorded on the order, so dropping it here would take the
// same money off twice.
export function billableOrderTotal(
  services: { status: OrderServiceStatus; subtotal: string | null }[],
  products: { cancelled_at: Date | null; subtotal: string | null }[]
): number {
  const serviceTotal = services
    .filter((item) => item.status !== "cancelled")
    .reduce((sum, item) => sum + Number(item.subtotal ?? 0), 0);
  const productTotal = products
    .filter((item) => item.cancelled_at == null)
    .reduce((sum, item) => sum + Number(item.subtotal ?? 0), 0);

  return serviceTotal + productTotal;
}

// When the shelf clock should read from, given where the order just landed.
// coalesce rather than a fresh now(): a rollup fired by a price edit or a
// payment must not push the clock forward, or an order sitting uncollected for a
// week would never surface as overdue. Null on any other status, so a qc_reject
// sending the Item back to the workshop restarts the wait from the day the
// customer is next told to come.
export function nextReadyAt(status: DerivedOrderStatus) {
  return status === "ready_for_pickup"
    ? sql`coalesce(${ordersTable.ready_at}, now())`
    : null;
}

export async function recomputeOrderRollup(
  executor: DbExecutor,
  orderId: number,
  updatedBy: number
): Promise<void> {
  const [services, products] = await Promise.all([
    executor.query.ordersServicesTable.findMany({
      where: { order_id: orderId },
      columns: { status: true, subtotal: true },
    }),
    executor.query.ordersProductsTable.findMany({
      where: { order_id: orderId },
      columns: { cancelled_at: true, subtotal: true },
    }),
  ]);

  const nextStatus = deriveOrderStatus(services, products);
  const nextTotal = billableOrderTotal(services, products);

  await executor
    .update(ordersTable)
    .set({
      status: nextStatus,
      completed_at: nextStatus === "completed" ? new Date() : null,
      cancelled_at: nextStatus === "cancelled" ? new Date() : null,
      ready_at: nextReadyAt(nextStatus),
      total: nextTotal.toString(),
      // A promo the customer already earned stays (ADR-0015), but it can
      // never be worth more than what is left to pay, so on a mostly
      // cancelled order it shrinks to fit.
      discount: sql`least(${ordersTable.discount}, ${nextTotal})`,
      updated_by: updatedBy,
    })
    .where(eq(ordersTable.id, orderId));
}

export interface TransitionOrderServiceInput {
  by: number;
  cancelNote?: string | null;
  cancelReason?: CancelReason;
  note?: string;
  orderId: number;
  serviceId: number;
  to: OrderServiceStatus;
}

export async function transitionOrderService(
  executor: DbExecutor,
  input: TransitionOrderServiceInput
): Promise<{ from: OrderServiceStatus; to: OrderServiceStatus }> {
  const { orderId, serviceId, to, by, note, cancelReason, cancelNote } = input;

  if (to === "picked_up") {
    throw new BadRequestException(
      "Items must be picked up through the pickup desk, not the status dropdown"
    );
  }
  if (to === "refunded") {
    throw new BadRequestException(
      "Refund transitions must go through the refund flow"
    );
  }

  const current = await executor.query.ordersServicesTable.findFirst({
    where: { order_id: orderId, id: serviceId },
    columns: { id: true, status: true },
  });
  if (!current) {
    throw new BadRequestException("Order service not found for this order");
  }

  const from = current.status;
  if (!ORDER_SERVICE_TRANSITIONS[from].includes(to)) {
    throw new BadRequestException(
      `Invalid status transition from ${from} to ${to}`
    );
  }

  // ADR-0012: proof-of-condition before work starts. A pair cannot leave
  // queued → processing without at least one non-deleted photo. The qc_reject
  // redo loop is exempt — photos already exist by then.
  if (from === "queued" && to === "processing") {
    const photo = await executor.query.orderServicesImagesTable.findFirst({
      where: { order_service_id: serviceId, deleted_at: { isNull: true } },
      columns: { id: true },
    });
    if (!photo) {
      throw new BadRequestException("Add an item photo before starting work");
    }
  }

  if (to === "cancelled") {
    if (!cancelReason) {
      throw new BadRequestException(
        "Cancel reason is required when cancelling a service"
      );
    }
    const order = await executor.query.ordersTable.findFirst({
      where: { id: orderId },
      columns: { payment_status: true },
    });
    if (order?.payment_status === "paid") {
      throw new BadRequestException(
        "Paid orders cannot cancel individual services. Refund the service instead."
      );
    }
  }

  const setPatch: Partial<typeof ordersServicesTable.$inferInsert> = {
    status: to,
  };
  if (to === "cancelled") {
    setPatch.cancel_reason = cancelReason;
    setPatch.cancel_note = cancelNote ?? null;
  }

  const updated = await executor
    .update(ordersServicesTable)
    .set(setPatch)
    .where(
      and(
        eq(ordersServicesTable.id, serviceId),
        eq(ordersServicesTable.status, from)
      )
    )
    .returning({ id: ordersServicesTable.id });

  if (updated.length === 0) {
    throw new BadRequestException(
      "Service changed state before transition could apply. Refresh and try again."
    );
  }

  await executor.insert(orderServiceStatusLogsTable).values({
    order_service_id: serviceId,
    from_status: from,
    to_status: to,
    changed_by: by,
    note,
  });

  await recomputeOrderRollup(executor, orderId, by);

  return { from, to };
}

export interface CompletePickupInput {
  by: number;
  itemIds: number[];
  note?: string;
  orderId: number;
  pickupEventId: number;
}

// Objects leave the counter, treatments do not — so the unit here is the Item,
// and which of its rows flip is worked out from the Item rather than trusted
// from the caller. ADR-0017's "you cannot hand back half an object" then holds
// for anyone who reaches this, not just the pickup desk, and the read happens
// inside the caller's transaction: resolving siblings outside it would let a
// rework queued a moment earlier slip past the check.
export async function completePickup(
  executor: DbExecutor,
  input: CompletePickupInput
): Promise<{ flippedIds: number[]; requestedIds: number[] }> {
  const { orderId, itemIds, pickupEventId, by, note } = input;

  const items = await executor.query.itemsTable.findMany({
    where: { order_id: orderId, id: { in: itemIds } },
    columns: { id: true, item_code: true },
    with: { services: { columns: { id: true, status: true } } },
  });

  if (items.length !== itemIds.length) {
    throw new BadRequestException(
      "One or more items do not belong to this order"
    );
  }

  const notCollectable = items.filter(
    (item) => !isItemCollectable(item.services)
  );
  if (notCollectable.length > 0) {
    throw new BadRequestException(
      `Items not ready for pickup: ${notCollectable
        .map((item) => item.item_code)
        .join(", ")}`
    );
  }

  const services = items.flatMap((item) =>
    item.services.filter((service) => service.status === "ready_for_pickup")
  );
  const serviceIds = services.map((service) => service.id);

  const flipped = await executor
    .update(ordersServicesTable)
    .set({ status: "picked_up", pickup_event_id: pickupEventId })
    .where(
      and(
        eq(ordersServicesTable.order_id, orderId),
        inArray(ordersServicesTable.id, serviceIds),
        eq(ordersServicesTable.status, "ready_for_pickup")
      )
    )
    .returning({ id: ordersServicesTable.id });

  if (flipped.length !== serviceIds.length) {
    return {
      flippedIds: flipped.map((row) => row.id),
      requestedIds: serviceIds,
    };
  }

  await executor.insert(orderServiceStatusLogsTable).values(
    services.map((service) => ({
      order_service_id: service.id,
      from_status: service.status,
      to_status: "picked_up" as const,
      changed_by: by,
      note,
    }))
  );

  await recomputeOrderRollup(executor, orderId, by);

  return { flippedIds: flipped.map((row) => row.id), requestedIds: serviceIds };
}

export interface RefundTransitionItem {
  note?: string;
  serviceId: number;
}

export interface ApplyRefundTransitionInput {
  by: number;
  items: RefundTransitionItem[];
  orderId: number;
}

export async function applyRefundTransition(
  executor: DbExecutor,
  input: ApplyRefundTransitionInput
): Promise<void> {
  const { orderId, items, by } = input;
  const serviceIds = items.map((item) => item.serviceId);

  const services = await executor.query.ordersServicesTable.findMany({
    where: { order_id: orderId, id: { in: serviceIds } },
    columns: { id: true, status: true },
  });

  if (services.length !== serviceIds.length) {
    throw new BadRequestException(
      "One or more services do not belong to this order"
    );
  }

  const fromStatusById = new Map<number, OrderServiceStatus>(
    services.map((service) => [service.id, service.status])
  );

  for (const service of services) {
    if (!ORDER_SERVICE_TRANSITIONS[service.status].includes("refunded")) {
      throw new BadRequestException(
        `Service ${service.id} cannot be refunded from status ${service.status}`
      );
    }
  }

  await executor
    .update(ordersServicesTable)
    .set({ status: "refunded" })
    .where(
      and(
        eq(ordersServicesTable.order_id, orderId),
        inArray(ordersServicesTable.id, serviceIds)
      )
    );

  await executor.insert(orderServiceStatusLogsTable).values(
    items.map((item) => ({
      order_service_id: item.serviceId,
      from_status: fromStatusById.get(item.serviceId),
      to_status: "refunded" as const,
      changed_by: by,
      note: item.note,
    }))
  );

  await recomputeOrderRollup(executor, orderId, by);
}
