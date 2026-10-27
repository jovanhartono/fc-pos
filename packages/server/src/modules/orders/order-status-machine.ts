import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { DbExecutor } from "@/db";
import {
  type cancelReasonEnum,
  complaintsTable,
  type orderServiceStatusEnum,
  orderServiceStatusLogsTable,
  ordersServicesTable,
  ordersTable,
} from "@/db/schema";
import { BadRequestException } from "@/http-exceptions";
import { assertStartPhoto } from "@/modules/orders/order-photo-gate.repository";

export type OrderServiceStatus =
  (typeof orderServiceStatusEnum.enumValues)[number];

type CancelReason = (typeof cancelReasonEnum.enumValues)[number];

// Lived here before it had other callers; re-exported so nothing that already
// imports it has to move.
export type { DbExecutor } from "@/db";

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

// Statuses the workshop still has to act on. `ready_for_pickup` is left out: the
// Item waits at the counter for the Customer, so the Queue neither lists nor counts it.
export const WORKSHOP_SERVICE_STATUSES = [
  "queued",
  "processing",
  "waiting_qc",
  "qc_reject",
] as const;

export function isInWorkshop(line: { status: string }): boolean {
  return (WORKSHOP_SERVICE_STATUSES as readonly string[]).includes(line.status);
}

// A cleaned shoe whose Repaint hasn't started is still being worked on: the
// Counter and the Customer's Track page call it Waiting QC only when nothing
// but the check is left.
export function isWaitingQcOnly(lines: { status: string }[]): boolean {
  const left = lines.filter(isInWorkshop);
  return left.length > 0 && left.every((line) => line.status === "waiting_qc");
}

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
  processing: ["waiting_qc", "cancelled", "refunded"],
  waiting_qc: ["qc_reject", "ready_for_pickup", "cancelled", "refunded"],
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
  terminal_count: number;
  total_count: number;
}

// One status per thing counted. The Order detail passes Item statuses, so a pair
// booked for a clean and a repaint counts once at the counter. Cancelled ones are
// left out, or the Order would read "2 of 3" forever after the Customer took everything.
export function summarizeOrderFulfillment(
  statuses: OrderServiceStatus[]
): OrderFulfillmentSummary {
  const total_count = statuses.filter(
    (status) => status !== "cancelled"
  ).length;
  const ready_for_pickup_count = statuses.filter(
    (status) => status === "ready_for_pickup"
  ).length;
  const picked_up_count = statuses.filter(
    (status) => status === "picked_up"
  ).length;
  const terminal_count = statuses.filter((status) =>
    isTerminalOrderServiceStatus(status)
  ).length;
  const active_count = statuses.length - terminal_count;
  const in_workshop_count = active_count - ready_for_pickup_count;

  return {
    active_count,
    is_partially_picked_up: picked_up_count > 0 && active_count > 0,
    is_ready_for_pickup: active_count > 0 && in_workshop_count === 0,
    picked_up_count,
    ready_for_pickup_count,
    remaining_count: total_count - picked_up_count,
    terminal_count,
    total_count,
  };
}

// The progress rule an Order and an Item share; each names its own endings.
type TreatmentWorkPhase =
  | "nothing_started"
  | "in_progress"
  | "all_ready"
  | "no_live_work";

function classifyTreatmentWork(
  services: { status: OrderServiceStatus }[]
): TreatmentWorkPhase {
  const active = services.filter(
    (item) => !isTerminalOrderServiceStatus(item.status)
  );

  if (active.length === 0) {
    return "no_live_work";
  }
  if (active.every((item) => item.status === "ready_for_pickup")) {
    return "all_ready";
  }
  // A cancelled line is no sign anyone started: the Customer who dropped one
  // treatment must still see the rest as untouched. Picked-up or refunded lines do count.
  if (
    services.some(
      (item) => item.status !== "queued" && item.status !== "cancelled"
    )
  ) {
    return "in_progress";
  }
  return "nothing_started";
}

// `pickup_event_id` is the only record of whether the Item physically left the
// shop. The schema allows it only on picked_up or refunded, and requires it on picked_up.
export interface ItemStatusLine {
  pickup_event_id: number | null;
  status: OrderServiceStatus;
}

// Worked out on read, never stored: an Item always loads with its own lines, so a
// column would be a second copy of the truth (ADR-0017).
export type DerivedItemStatus =
  | "queued"
  | "processing"
  | "ready_for_pickup"
  | "picked_up"
  | "refunded"
  | "cancelled";

export function deriveItemStatus(
  services: ItemStatusLine[]
): DerivedItemStatus {
  const phase = classifyTreatmentWork(services);

  if (phase === "all_ready") {
    return "ready_for_pickup";
  }
  if (phase === "in_progress") {
    return "processing";
  }
  if (phase === "nothing_started") {
    return "queued";
  }

  // An Item status says where the object is, so the pickup event splits the
  // endings: a pair refunded while still queued never left the rack, and calling
  // it picked_up would tell the Customer on /track the shoes are already home.
  if (services.length === 0) {
    return "queued";
  }
  if (services.every((service) => service.status === "cancelled")) {
    return "cancelled";
  }
  if (services.some((service) => service.pickup_event_id != null)) {
    return "picked_up";
  }
  return "refunded";
}

// An Item leaves only once every live line on it is ready. `refunded` is a pair
// refunded while it sat queued: still the Customer's to take home, and without it
// the counter could never record handing it back.
export function isCollectableItemStatus(status: DerivedItemStatus): boolean {
  return status === "ready_for_pickup" || status === "refunded";
}

export function isItemCollectable(services: ItemStatusLine[]): boolean {
  return isCollectableItemStatus(deriveItemStatus(services));
}

// The "2 of 3 ready" pair, one entry per Item: ready once it can leave the
// counter (or already has); a cancelled one is not counted at all.
export function countItemsReady(items: ItemStatusLine[][]) {
  const statuses = items
    .map(deriveItemStatus)
    .filter((status) => status !== "cancelled");
  return {
    items_total: statuses.length,
    items_ready: statuses.filter(
      (status) => isCollectableItemStatus(status) || status === "picked_up"
    ).length,
  };
}

// Lines that leave with the Item at pickup: finished ones, and ones refunded
// before the Customer came back. Exported so the pickup dialog lists exactly these
// rows instead of keeping its own copy of the rule (as ADR-0018's `hasUnpricedLine`).
export function isHandedOverByPickup(line: ItemStatusLine): boolean {
  return (
    line.status === "ready_for_pickup" ||
    (line.status === "refunded" && line.pickup_event_id == null)
  );
}

export function deriveOrderStatus(
  services: { status: OrderServiceStatus }[],
  products: { cancelled_at: Date | null }[]
): DerivedOrderStatus {
  // Products have no workshop status, so only services count as live work.
  const phase = classifyTreatmentWork(services);

  if (phase === "all_ready") {
    return "ready_for_pickup";
  }
  if (phase === "in_progress") {
    return "processing";
  }
  if (phase === "nothing_started") {
    return "created";
  }

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

// Cancelled work drops off the bill; refunded work stays, because the Refund is
// already recorded on the Order and dropping it here would take the money off twice.
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

// coalesce, not now(): a price edit or payment on an uncollected Order must not
// restart its shelf clock, or a week-old Order would never show as overdue. Null
// otherwise, so work sent back to the workshop starts a fresh wait once ready again.
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
      // An earned promo stays (ADR-0015) but never exceeds what is left to
      // pay, so on a mostly cancelled Order it shrinks to fit.
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

// Without the Order rollup, so cancelling six lines at once recomputes the Order
// once at the end.
async function applyServiceTransition(
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
    columns: { id: true, status: true, item_id: true, complaint_id: true },
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

  // ADR-0012: proof-of-condition before work starts. The qc_reject redo loop
  // is exempt — photos already exist by then.
  if (from === "queued" && to === "processing") {
    await assertStartPhoto(executor, current);
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
      "Someone just changed this line. Refresh and try again."
    );
  }

  await executor.insert(orderServiceStatusLogsTable).values({
    order_service_id: serviceId,
    from_status: from,
    to_status: to,
    changed_by: by,
    note,
  });

  return { from, to };
}

export async function transitionOrderService(
  executor: DbExecutor,
  input: TransitionOrderServiceInput
): Promise<{ from: OrderServiceStatus; to: OrderServiceStatus }> {
  const moved = await applyServiceTransition(executor, input);

  await recomputeOrderRollup(executor, input.orderId, input.by);

  return moved;
}

// A line has no created_at, so this row is the only record of who put a
// Rework round on the rack, and when (ADR-0013).
export async function logReworkQueued(
  executor: DbExecutor,
  { by, note, serviceId }: { by: number; note: string; serviceId: number }
) {
  await executor.insert(orderServiceStatusLogsTable).values({
    order_service_id: serviceId,
    from_status: null,
    to_status: "queued",
    changed_by: by,
    note,
  });
}

// The pair's original was cancelled or refunded, so its free re-clean stops
// too, even on a paid Order (ADR-0013, 2026-09-24). A pair that went home and
// came back is put on the shelf as is rather than cancelled, or it could never
// be handed back (ADR-0013, 2026-10-06).
async function stopLiveReworks(
  executor: DbExecutor,
  {
    by,
    note,
    originalIds,
    to,
  }: {
    by: number;
    note: string;
    originalIds: number[];
    to: "cancelled" | "ready_for_pickup";
  }
): Promise<number[]> {
  if (originalIds.length === 0) {
    return [];
  }

  const reworks = await executor
    .select({ id: ordersServicesTable.id, status: ordersServicesTable.status })
    .from(ordersServicesTable)
    .innerJoin(
      complaintsTable,
      eq(ordersServicesTable.complaint_id, complaintsTable.id)
    )
    .where(
      and(
        inArray(complaintsTable.order_service_id, originalIds),
        inArray(ordersServicesTable.status, [...WORKSHOP_SERVICE_STATUSES])
      )
    )
    .for("update", { of: ordersServicesTable });

  const reworkIds = reworks.map((rework) => rework.id);
  if (reworkIds.length === 0) {
    return reworkIds;
  }

  await executor
    .update(ordersServicesTable)
    .set(
      to === "cancelled"
        ? { status: to, cancel_reason: "other", cancel_note: note }
        : { status: to }
    )
    .where(inArray(ordersServicesTable.id, reworkIds));

  await executor.insert(orderServiceStatusLogsTable).values(
    reworks.map((rework) => ({
      order_service_id: rework.id,
      from_status: rework.status,
      to_status: to,
      changed_by: by,
      note,
    }))
  );
  return reworkIds;
}

export interface CancelOrderServiceLine {
  note?: string;
  reason: CancelReason;
  serviceId: number;
}

// The counter cancels several lines on one Order in a single tap; the Order is
// worked out once at the end so the Customer's bill does not jump six times.
export async function cancelOrderServices(
  executor: DbExecutor,
  {
    by,
    lines,
    orderId,
  }: { by: number; lines: CancelOrderServiceLine[]; orderId: number }
): Promise<{ reworkIds: number[] }> {
  for (const line of lines) {
    await applyServiceTransition(executor, {
      by,
      cancelNote: line.note ?? null,
      cancelReason: line.reason,
      note: line.note ?? line.reason,
      orderId,
      serviceId: line.serviceId,
      to: "cancelled",
    });
  }

  const reworkIds = await stopLiveReworks(executor, {
    by,
    note: "Original line cancelled",
    originalIds: lines.map((line) => line.serviceId),
    to: "cancelled",
  });

  await recomputeOrderRollup(executor, orderId, by);

  return { reworkIds };
}

export interface CompletePickupInput {
  by: number;
  itemIds: number[];
  note?: string;
  orderId: number;
  pickupEventId: number;
}

// Which lines go is worked out from the Item here, inside the caller's
// transaction, so "no handing back half an object" (ADR-0017) holds for every
// caller and a Rework queued a moment earlier cannot slip past.
// Finished lines flip to picked_up; lines refunded before the Customer came back
// only get the pickup stamp.
export async function completePickup(
  executor: DbExecutor,
  input: CompletePickupInput
): Promise<{ handedOverIds: number[]; requestedIds: number[] }> {
  const { orderId, itemIds, pickupEventId, by, note } = input;

  // Another cashier may be opening a counter complaint on this pair right now;
  // holding its lines first makes the check below see the rework it adds.
  await executor
    .select({ id: ordersServicesTable.id })
    .from(ordersServicesTable)
    .where(
      and(
        eq(ordersServicesTable.order_id, orderId),
        inArray(ordersServicesTable.item_id, itemIds)
      )
    )
    .orderBy(asc(ordersServicesTable.id))
    .for("update");

  const items = await executor.query.itemsTable.findMany({
    where: { order_id: orderId, id: { in: itemIds } },
    columns: { id: true, item_code: true },
    with: {
      services: {
        columns: { id: true, pickup_event_id: true, status: true },
      },
    },
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

  const handedOver = items
    .flatMap((item) => item.services)
    .filter(isHandedOverByPickup);
  const flipIds = handedOver
    .filter((service) => service.status === "ready_for_pickup")
    .map((service) => service.id);
  const stampIds = handedOver
    .filter((service) => service.status !== "ready_for_pickup")
    .map((service) => service.id);
  const requestedIds = [...flipIds, ...stampIds];

  const flipped =
    flipIds.length > 0
      ? await executor
          .update(ordersServicesTable)
          .set({ status: "picked_up", pickup_event_id: pickupEventId })
          .where(
            and(
              eq(ordersServicesTable.order_id, orderId),
              inArray(ordersServicesTable.id, flipIds),
              eq(ordersServicesTable.status, "ready_for_pickup")
            )
          )
          .returning({ id: ordersServicesTable.id })
      : [];

  // Same guard as the flip: a row another cashier already stamped is a row
  // this handover did not win, so the caller can roll the whole event back.
  const stamped =
    stampIds.length > 0
      ? await executor
          .update(ordersServicesTable)
          .set({ pickup_event_id: pickupEventId })
          .where(
            and(
              eq(ordersServicesTable.order_id, orderId),
              inArray(ordersServicesTable.id, stampIds),
              eq(ordersServicesTable.status, "refunded"),
              isNull(ordersServicesTable.pickup_event_id)
            )
          )
          .returning({ id: ordersServicesTable.id })
      : [];

  const handedOverIds = [...flipped, ...stamped].map((row) => row.id);

  if (handedOverIds.length !== requestedIds.length) {
    return { handedOverIds, requestedIds };
  }

  // Only flipped lines get a log row: refunded → refunded would show on the
  // timeline as a change that never happened. The pickup event records the handover.
  if (flipIds.length > 0) {
    await executor.insert(orderServiceStatusLogsTable).values(
      flipIds.map((serviceId) => ({
        order_service_id: serviceId,
        from_status: "ready_for_pickup" as const,
        to_status: "picked_up" as const,
        changed_by: by,
        note,
      }))
    );
  }

  await recomputeOrderRollup(executor, orderId, by);

  return { handedOverIds, requestedIds };
}

export interface RefundTransitionItem {
  // The admin lets the Rework run on: money back plus a free re-clean.
  keepRework?: boolean;
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

  // An admin on two tabs must not hand the same Item's cash back twice, and the
  // timeline must not claim a status the line had already left.
  for (const service of services) {
    const [won] = await executor
      .update(ordersServicesTable)
      .set({ status: "refunded" })
      .where(
        and(
          eq(ordersServicesTable.id, service.id),
          eq(ordersServicesTable.status, service.status)
        )
      )
      .returning({ id: ordersServicesTable.id });

    if (!won) {
      throw new BadRequestException(
        "Someone just changed this line. Refresh and try again."
      );
    }
  }

  await executor.insert(orderServiceStatusLogsTable).values(
    items.map((item) => ({
      order_service_id: item.serviceId,
      from_status: fromStatusById.get(item.serviceId),
      to_status: "refunded" as const,
      changed_by: by,
      note: item.note,
    }))
  );

  const keptIds = new Set(
    items.filter((item) => item.keepRework).map((item) => item.serviceId)
  );
  const stopped = services.filter((service) => !keptIds.has(service.id));
  const wentHome = (service: { status: OrderServiceStatus }) =>
    service.status === "picked_up";

  await stopLiveReworks(executor, {
    by,
    note: "Original line refunded",
    originalIds: stopped
      .filter((service) => !wentHome(service))
      .map((service) => service.id),
    to: "cancelled",
  });
  await stopLiveReworks(executor, {
    by,
    note: "Original line refunded",
    originalIds: stopped.filter(wentHome).map((service) => service.id),
    to: "ready_for_pickup",
  });

  await recomputeOrderRollup(executor, orderId, by);
}
