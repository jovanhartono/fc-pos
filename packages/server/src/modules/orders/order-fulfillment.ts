export const ORDER_TERMINAL_SERVICE_STATUSES = [
  "picked_up",
  "refunded",
  "cancelled",
] as const;

const ORDER_TERMINAL_SERVICE_STATUS_SET = new Set<string>(
  ORDER_TERMINAL_SERVICE_STATUSES
);

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

type OrderServiceStatus =
  | "queued"
  | "processing"
  | "quality_check"
  | "qc_reject"
  | "ready_for_pickup"
  | "picked_up"
  | "refunded"
  | "cancelled";

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
    ORDER_TERMINAL_SERVICE_STATUS_SET.has(status)
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

export function isTerminalOrderServiceStatus(status: OrderServiceStatus) {
  return ORDER_TERMINAL_SERVICE_STATUS_SET.has(status);
}
