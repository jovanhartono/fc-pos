import type { UseMutationResult } from "@tanstack/react-query";
import type { UpdateOrderServiceStatusPayload } from "@/lib/api";

export type UpdateStatusMutation = UseMutationResult<
	unknown,
	Error,
	{ serviceId: number; payload: UpdateOrderServiceStatusPayload },
	unknown
>;

export type NonCancelServiceStatus = Exclude<
	UpdateOrderServiceStatusPayload["status"],
	"cancelled"
>;

export const STATUS_ACTION_LABELS: Record<
	UpdateOrderServiceStatusPayload["status"],
	string
> = {
	queued: "Queue",
	processing: "Process",
	quality_check: "Quality Check",
	qc_reject: "Reject at QC",
	ready_for_pickup: "Ready for Pickup",
	picked_up: "Pick Up",
	refunded: "Refund",
	cancelled: "Cancel",
};
