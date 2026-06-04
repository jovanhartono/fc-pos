import type { ORDER_TERMINAL_SERVICE_STATUSES } from "@fresclean/api/schema";
import type { UseMutationResult } from "@tanstack/react-query";
import type { UpdateOrderServiceStatusPayload } from "@/lib/api";

export type UpdateStatusMutation = UseMutationResult<
	unknown,
	Error,
	{ serviceId: number; payload: UpdateOrderServiceStatusPayload },
	unknown
>;

// Terminal statuses (cancelled/refunded/picked_up) go through dedicated
// endpoints — the status endpoint rejects them, so they are never rendered.
export type NonTerminalServiceStatus = Exclude<
	UpdateOrderServiceStatusPayload["status"],
	(typeof ORDER_TERMINAL_SERVICE_STATUSES)[number]
>;

export const STATUS_ACTION_LABELS: Record<NonTerminalServiceStatus, string> = {
	queued: "Queue",
	processing: "Process",
	quality_check: "Quality Check",
	qc_reject: "Reject at QC",
	ready_for_pickup: "Ready for Pickup",
};
