import type { OrderCancelReason, OrderRefundReason } from "@/lib/api";

type BadgeVariant =
	| "secondary"
	| "success"
	| "danger"
	| "warning"
	| "info"
	| "outline"
	| "outline-success"
	| "outline-danger";

const cancelReasonLabels: Record<OrderCancelReason, string> = {
	customer_request: "Customer Request",
	cannot_process: "Cannot Process",
	damaged_intake: "Damaged at Intake",
	duplicate_order: "Duplicate Order",
	other: "Other",
};

export function formatCancelReason(reason: OrderCancelReason) {
	return cancelReasonLabels[reason];
}

const refundReasonLabels: Record<OrderRefundReason, string> = {
	damaged: "Damaged",
	cannot_process: "Cannot Process",
	lost: "Lost",
	other: "Other",
	customer_cancelled: "Customer Cancelled",
};

export function formatRefundReason(reason: OrderRefundReason) {
	return refundReasonLabels[reason];
}

export const CANCEL_REASONS = [
	"customer_request",
	"cannot_process",
	"damaged_intake",
	"duplicate_order",
	"other",
] as const satisfies readonly OrderCancelReason[];

export const REFUND_REASONS = [
	"damaged",
	"cannot_process",
	"lost",
	"other",
	"customer_cancelled",
] as const satisfies readonly OrderRefundReason[];

const paymentStatusLabels = {
	paid: "Paid",
	unpaid: "Unpaid",
} as const;

const refundStatusLabels = {
	full: "Fully Refunded",
	none: "No Refund",
	partial: "Partially Refunded",
} as const;

const orderStatusLabels = {
	cancelled: "Cancelled",
	completed: "Completed",
	created: "Created",
	processing: "Processing",
	ready_for_pickup: "Ready for Pickup",
} as const;

const orderServiceStatusLabels = {
	cancelled: "Cancelled",
	picked_up: "Picked Up",
	processing: "In Progress",
	qc_reject: "QC Rejected",
	quality_check: "Quality Check",
	queued: "Queued",
	ready_for_pickup: "Ready for Pickup",
	refunded: "Refunded",
} as const;

export function getPaymentStatusBadgeVariant(
	status: keyof typeof paymentStatusLabels,
): BadgeVariant {
	return status === "paid" ? "outline-success" : "outline-danger";
}

export function formatPaymentStatus(status: keyof typeof paymentStatusLabels) {
	return paymentStatusLabels[status];
}

export const getRefundStatusBadgeVariant = (
	status: keyof typeof refundStatusLabels,
): BadgeVariant => {
	switch (status) {
		case "full":
			return "danger";
		case "partial":
			return "warning";
		default:
			return "outline";
	}
};

export const formatRefundStatus = (status: keyof typeof refundStatusLabels) =>
	refundStatusLabels[status];

export function getOrderStatusBadgeVariant(
	status: keyof typeof orderStatusLabels,
): BadgeVariant {
	switch (status) {
		case "completed":
			return "success";
		case "ready_for_pickup":
			return "success";
		case "processing":
			return "info";
		case "cancelled":
			return "danger";
		default:
			return "warning";
	}
}

export function formatOrderStatus(status: keyof typeof orderStatusLabels) {
	return orderStatusLabels[status];
}

export function getOrderServiceStatusBadgeVariant(
	status: string,
): BadgeVariant {
	switch (status) {
		case "queued":
			return "warning";
		case "processing":
			return "info";
		case "quality_check":
			return "warning";
		case "qc_reject":
			return "danger";
		case "ready_for_pickup":
			return "success";
		case "picked_up":
			return "success";
		case "refunded":
			return "danger";
		case "cancelled":
			return "danger";
		default:
			return "outline";
	}
}

export function formatOrderServiceStatus(status: string) {
	return (
		orderServiceStatusLabels[status as keyof typeof orderServiceStatusLabels] ??
		status
	);
}
