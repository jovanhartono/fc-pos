import { and, eq, inArray } from "drizzle-orm";
import type { db } from "@/db";
import {
  type cancelReasonEnum,
  type orderServiceStatusEnum,
  orderServiceStatusLogsTable,
  ordersServicesTable,
  ordersTable,
} from "@/db/schema";
import { BadRequestException } from "@/errors";
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
    if (services.some((item) => item.status !== "queued")) {
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

export async function recomputeOrderRollup(
  executor: DbExecutor,
  orderId: number,
  updatedBy: number
): Promise<void> {
  const [services, products] = await Promise.all([
    executor.query.ordersServicesTable.findMany({
      where: { order_id: orderId },
      columns: { status: true },
    }),
    executor.query.ordersProductsTable.findMany({
      where: { order_id: orderId },
      columns: { cancelled_at: true },
    }),
  ]);

  const nextStatus = deriveOrderStatus(services, products);

  await executor
    .update(ordersTable)
    .set({
      status: nextStatus,
      completed_at: nextStatus === "completed" ? new Date() : null,
      cancelled_at: nextStatus === "cancelled" ? new Date() : null,
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
  note?: string;
  orderId: number;
  pickupEventId: number;
  serviceIds: number[];
}

export async function completePickup(
  executor: DbExecutor,
  input: CompletePickupInput
): Promise<{ flippedIds: number[] }> {
  const { orderId, serviceIds, pickupEventId, by, note } = input;

  const services = await executor.query.ordersServicesTable.findMany({
    where: { order_id: orderId, id: { in: serviceIds } },
    columns: { id: true, status: true },
  });

  if (services.length !== serviceIds.length) {
    throw new BadRequestException(
      "One or more services do not belong to this order"
    );
  }

  for (const service of services) {
    if (!ORDER_SERVICE_TRANSITIONS[service.status].includes("picked_up")) {
      throw new BadRequestException(
        `Service ${service.id} cannot be picked up from status ${service.status}`
      );
    }
  }

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
    return { flippedIds: flipped.map((row) => row.id) };
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

  return { flippedIds: flipped.map((row) => row.id) };
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
