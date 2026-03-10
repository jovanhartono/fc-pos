type BadgeVariant =
	| "secondary"
	| "success"
	| "danger"
	| "warning"
	| "info"
	| "outline";

const paymentStatusLabels = {
	paid: "Paid",
	unpaid: "Unpaid",
} as const;

const orderStatusLabels = {
	cancelled: "Cancelled",
	completed: "Completed",
	created: "Created",
	processing: "Processing",
} as const;

const orderServiceStatusLabels = {
	cancelled: "Cancelled",
	picked_up: "Picked Up",
	processing: "In Progress",
	quality_check: "Quality Check",
	queued: "Queued",
	ready_for_pickup: "Ready for Pickup",
	received: "Received",
	refunded: "Refunded",
} as const;

export function getPaymentStatusBadgeVariant(
	status: keyof typeof paymentStatusLabels,
): BadgeVariant {
	return status === "paid" ? "success" : "danger";
}

export function formatPaymentStatus(status: keyof typeof paymentStatusLabels) {
	return paymentStatusLabels[status];
}

export function getOrderStatusBadgeVariant(
	status: keyof typeof orderStatusLabels,
): BadgeVariant {
	switch (status) {
		case "completed":
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
	status: keyof typeof orderServiceStatusLabels,
): BadgeVariant {
	switch (status) {
		case "received":
			return "secondary";
		case "queued":
			return "warning";
		case "processing":
			return "info";
		case "quality_check":
			return "warning";
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

export function formatOrderServiceStatus(
	status: keyof typeof orderServiceStatusLabels,
) {
	return orderServiceStatusLabels[status];
}
