import type { Order } from "@/features/orders/api";
import {
	isCancelledBeforePayment,
	type OrderPaymentState,
} from "@/features/orders/lib/order-action-gates";
import {
	type BadgeVariant,
	formatPaymentStatus,
	getPaymentStatusBadgeVariant,
	getRefundStatusBadgeVariant,
} from "@/lib/status";

export interface PaymentBadgeOrder extends OrderPaymentState {
	refund_status: Order["refund_status"];
}

interface PaymentBadge {
	label: string;
	variant: BadgeVariant;
}

// "Paid" beside "Fully Refunded" read as a contradiction on the Orders list:
// once every rupiah has gone back, the Order is simply Refunded.
export const getPaymentBadges = (order: PaymentBadgeOrder): PaymentBadge[] => {
	if (isCancelledBeforePayment(order)) {
		return [];
	}
	const refund = getRefundBadge(order.refund_status);
	if (refund && order.refund_status === "full") {
		return [refund];
	}
	const payment: PaymentBadge = {
		label: formatPaymentStatus(order.payment_status),
		variant: getPaymentStatusBadgeVariant(order.payment_status),
	};
	return refund ? [payment, refund] : [payment];
};

export const getRefundBadge = (
	status: Order["refund_status"],
): PaymentBadge | null => {
	if (status === "none") {
		return null;
	}
	return {
		label: status === "full" ? "Refunded" : "Partial refund",
		variant: getRefundStatusBadgeVariant(status),
	};
};
