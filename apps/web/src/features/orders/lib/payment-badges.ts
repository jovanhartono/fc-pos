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

interface PaymentBadgeOrder extends OrderPaymentState {
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
	if (order.refund_status === "full") {
		return [
			{ label: "Refunded", variant: getRefundStatusBadgeVariant("full") },
		];
	}
	const payment: PaymentBadge = {
		label: formatPaymentStatus(order.payment_status),
		variant: getPaymentStatusBadgeVariant(order.payment_status),
	};
	if (order.refund_status === "partial") {
		return [
			payment,
			{
				label: "Partial refund",
				variant: getRefundStatusBadgeVariant("partial"),
			},
		];
	}
	return [payment];
};
