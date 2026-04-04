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
	ready_for_pickup: "Ready for Pickup",
} as const;

const orderServiceStatusLabels = {
	cancelled: "Cancelled",
	picked_up: "Picked Up",
	processing: "In Progress",
	quality_check: "Quality Check",
	queued: "Queued",
	ready_for_pickup: "Ready for Pickup",
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

type OrderFulfillmentLike = {
	active_count: number;
	is_partially_picked_up: boolean;
	is_ready_for_pickup: boolean;
	picked_up_count: number;
	ready_for_pickup_count: number;
	service_total_count: number;
};

export function formatOrderPickupState(
	fulfillment: OrderFulfillmentLike,
): string {
	if (fulfillment.service_total_count === 0) {
		return "No Service Lines";
	}

	if (fulfillment.is_ready_for_pickup) {
		return "Ready for Pickup";
	}

	if (fulfillment.is_partially_picked_up) {
		return "Partially Picked Up";
	}

	if (fulfillment.picked_up_count === fulfillment.service_total_count) {
		return "Fully Picked Up";
	}

	if (fulfillment.active_count === 0) {
		return "Closed";
	}

	return "In Service";
}

export function getOrderPickupStateBadgeVariant(
	fulfillment: OrderFulfillmentLike,
): BadgeVariant {
	if (fulfillment.is_ready_for_pickup) {
		return "success";
	}

	if (fulfillment.is_partially_picked_up) {
		return "warning";
	}

	if (fulfillment.active_count === 0) {
		return "secondary";
	}

	return "info";
}
