import type { NonTerminalServiceStatus } from "@/features/orders/lib/order-service-actions";

export const STATUS_ACTION_LABELS: Record<NonTerminalServiceStatus, string> = {
  queued: "Queue",
  processing: "Process",
  waiting_qc: "Waiting QC",
  qc_reject: "Reject at QC",
  ready_for_pickup: "Ready for Pickup",
};
