import { and, eq, inArray, isNull, sql } from "drizzle-orm";
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

// The statuses a workshop still has to act on. `ready_for_pickup` is live but
// not workshop work: the treatment is finished and the object is the counter's
// until the customer collects it, so the queue does not list it and the chips
// do not count it.
export const WORKSHOP_SERVICE_STATUSES = [
  "queued",
  "processing",
  "quality_check",
  "qc_reject",
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
  terminal_count: number;
  total_count: number;
}

// Takes one status per thing being counted. The order detail hands it Item
// statuses, because "2 of 4 picked up" is read at the counter as objects on
// the shelf — a pair booked for a clean and a repaint is one thing to hand
// back, not two. The list rollup still hands it treatment statuses; nothing
// reads its counts today.
//
// The counts measure the handover, not the workshop: `total_count` is what
// will ever go home (a cancelled one never does, so it is left out — otherwise
// an order with one cancelled pair reads "2 of 3" forever after the customer
// left with everything), `picked_up_count` is what already has, and
// `remaining_count` is the gap, whether that is still being worked on or a
// refunded pair waiting on the shelf.
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

// How far along the live treatments are, with nothing said about what the
// ending is called. This is the part an Order and an Item genuinely share —
// including the subtle rule that a cancelled line is not evidence anyone
// started — so it lives here once and each aggregate names its own endings.
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
  // Has anything actually been worked on? A cancelled line is work the shop
  // will never do, so it is no evidence that anyone started — the customer who
  // dropped the treatment at the counter must still see the rest of the rack as
  // untouched. Every other terminal line (picked_up, refunded) IS evidence:
  // that work happened and left.
  if (
    services.some(
      (item) => item.status !== "queued" && item.status !== "cancelled"
    )
  ) {
    return "in_progress";
  }
  return "nothing_started";
}

// A treatment as the Item rollup needs to see it. `pickup_event_id` is not
// decoration here — it is the only record of whether this treatment's object
// physically went out the door, and the schema keeps it honest: the column is
// NULL unless the row is picked_up or refunded, and never NULL on picked_up.
export interface ItemStatusLine {
  pickup_event_id: number | null;
  status: OrderServiceStatus;
}

// What an Item is doing, rolled up from the treatments applied to it. Derived
// on read and never stored: an Item is only ever loaded beside its own
// treatments, so a column would be a second copy of the truth with nothing to
// gain from it. See ADR-0017.
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

  // Nothing live is left, and unlike an Order — which only has to say whether
  // money settled — an Item status is a claim about where the physical object
  // is. So the endings split three ways, and the pickup event is what tells
  // them apart: a pair refunded at the counter while it was still queued never
  // moved off the rack, and calling that picked_up would tell the customer on
  // /track that they are holding shoes still sitting in the shop.
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

// You cannot hand back half an object: an Item leaves the counter only once
// every treatment still live on it is ready. A cancelled sibling does not hold
// the object hostage — the shop is never going to do that work.
//
// `refunded` is the object nobody ever touched: the money went back over the
// counter while the pair sat queued, and the pair is still the customer's to
// take home. It has no live treatment left that could ever turn ready, so
// without this branch the desk could never record handing it back at all.
export function isCollectableItemStatus(status: DerivedItemStatus): boolean {
  return status === "ready_for_pickup" || status === "refunded";
}

export function isItemCollectable(services: ItemStatusLine[]): boolean {
  return isCollectableItemStatus(deriveItemStatus(services));
}

// Does this treatment leave the shop when the desk hands its object over?
// The finished ones do, and so do the ones refunded before anyone came for the
// pair — the shop still owes those back. A cancelled treatment does not: the
// work was called off, and the schema refuses it a pickup event. One already
// carrying an event went out on an earlier handover.
//
// Exported through `@fresclean/api/schema` so the pickup dialog lists exactly
// the rows this will act on, rather than the client keeping its own copy of
// the rule (the same seam ADR-0018's `hasUnpricedLine` uses).
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
  // Live work comes only from services (products have no processing axis).
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

  // No live services: roll up over every terminal line — services and products.
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

// The photo gate's one rule (ADR-0019). Any live photo on the Item unlocks
// work on it — unless the line is a Rework, in which case the photo has to
// postdate the Complaint: the object came back over the counter, and the first
// visit's photos say nothing about the condition it came back in.
export function hasStartPhoto(
  photos: ReadonlyArray<{ created_at: Date }>,
  reworkOpenedAt: Date | null
): boolean {
  return photos.some(
    (photo) => reworkOpenedAt === null || photo.created_at > reworkOpenedAt
  );
}

// Reads the Item's photos and, for a Rework, the Complaint they must postdate,
// then applies hasStartPhoto.
async function assertStartPhoto(
  executor: DbExecutor,
  line: { item_id: number; complaint_id: number | null }
) {
  const [photos, complaint] = await Promise.all([
    executor.query.itemImagesTable.findMany({
      where: { item_id: line.item_id, deleted_at: { isNull: true } },
      columns: { created_at: true },
    }),
    line.complaint_id
      ? executor.query.complaintsTable.findFirst({
          where: { id: line.complaint_id },
          columns: { created_at: true },
        })
      : undefined,
  ]);
  if (!hasStartPhoto(photos, complaint?.created_at ?? null)) {
    throw new BadRequestException(
      complaint
        ? "Add a photo of the returned item before starting the rework"
        : "Add an item photo before starting work"
    );
  }
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
// and which of its rows take part is worked out from the Item rather than
// trusted from the caller. ADR-0017's "you cannot hand back half an object"
// then holds for anyone who reaches this, not just the pickup desk, and the
// read happens inside the caller's transaction: resolving siblings outside it
// would let a rework queued a moment earlier slip past the check.
//
// Two kinds of row leave with the object. The finished ones flip to picked_up.
// The ones refunded before the customer ever came back have no status left to
// move — the shop still owes them the pair — so they only take the stamp
// saying which handover took them out. A cancelled sibling takes neither: the
// shop never did that work, and the schema refuses it a pickup event.
export async function completePickup(
  executor: DbExecutor,
  input: CompletePickupInput
): Promise<{ handedOverIds: number[]; requestedIds: number[] }> {
  const { orderId, itemIds, pickupEventId, by, note } = input;

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

  // Only the flips get a log line. A stamped row did not change status, and a
  // refunded → refunded entry would render on the line's timeline as a
  // transition that never happened; the pickup event itself is the record of
  // when that pair went back and who handed it over.
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
