import { isInWorkshop } from "@/schema/order-status";
import type { OrderServiceStatus } from "@/schema/order-status";

// A finished line (ADR-0013, 2026-09-24): usually turned down at the counter
// while still ready, sometimes brought back after it went home.
export const isComplainableStatus = (status: string): boolean =>
  status === "ready_for_pickup" || status === "picked_up";

// The Customer at the counter is shown the whole Item, so a ready line waits
// until nothing else on its Item is still in the workshop.
export const isComplainableLine = (
  line: { status: string },
  itemLines: readonly { status: string }[]
): boolean =>
  line.status === "picked_up" ||
  (line.status === "ready_for_pickup" && !itemLines.some(isInWorkshop));

// A cancelled round re-cleaned nothing, so it does not make a Complaint Reworked.
export const isReworkedRound = (round: { status: string }): boolean =>
  round.status !== "cancelled";

export type ComplaintOutcome =
  | "refunded"
  | "cancelled"
  | "reworked"
  | "pending";

// A Complaint stores no status (ADR-0013 amendment); the Complaint page badge and
// the report sheets both read it here, so they never disagree.
export const complaintOutcome = (line: {
  status: OrderServiceStatus;
  has_live_rework: boolean;
}): ComplaintOutcome => {
  if (line.status === "refunded" || line.status === "cancelled") {
    return line.status;
  }
  return line.has_live_rework ? "reworked" : "pending";
};
