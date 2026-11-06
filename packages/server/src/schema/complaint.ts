import { isInWorkshop } from "@/schema/order-status";

// A finished line (ADR-0013, 2026-09-24): usually turned down at the counter
// while still ready, sometimes brought back after it went home.
export function isComplainableStatus(status: string): boolean {
  return status === "ready_for_pickup" || status === "picked_up";
}

// The Customer at the counter is shown the whole Item, so a ready line waits
// until nothing else on its Item is still in the workshop.
export function isComplainableLine(
  line: { status: string },
  itemLines: ReadonlyArray<{ status: string }>
): boolean {
  return (
    line.status === "picked_up" ||
    (line.status === "ready_for_pickup" && !itemLines.some(isInWorkshop))
  );
}

// A cancelled round re-cleaned nothing, so it does not make a Complaint Reworked.
export function isReworkedRound(round: { status: string }): boolean {
  return round.status !== "cancelled";
}
