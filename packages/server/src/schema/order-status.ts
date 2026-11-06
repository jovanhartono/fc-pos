import type { orderServiceStatusEnum } from "@/db/schema";

export type OrderServiceStatus =
  (typeof orderServiceStatusEnum.enumValues)[number];

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

// An Item leaves only once every live line on it is ready. `refunded` is a pair
// refunded while it sat queued: still the Customer's to take home, and without it
// the counter could never record handing it back.
export function isCollectableItemStatus(status: DerivedItemStatus): boolean {
  return status === "ready_for_pickup" || status === "refunded";
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
