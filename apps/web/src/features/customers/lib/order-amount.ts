import {
	isCancelledBeforePayment,
	type OrderPaymentState,
} from "@/features/orders/lib/order-action-gates";
import { formatMoney } from "@/shared/money";

export interface OrderAmountState extends OrderPaymentState {
	has_unpriced_line: boolean;
	paid_amount: string;
	refunded_amount: string;
}

export interface OrderAmountDisplay {
	/** Secondary line, present only when money went back out. */
	refunded: string | null;
	label: string;
	/** What the shop kept; null when the row carries no number — show the label
	 * as absent, not as zero. */
	net: number | null;
}

// What one Order contributed to this customer's Lifetime spend, read off the
// row: a paid Order shows what the shop kept, collected minus anything
// refunded, on the same rule the header figure is summed from.
export const describeOrderAmount = (
	order: OrderAmountState,
): OrderAmountDisplay => {
	if (isCancelledBeforePayment(order)) {
		return { label: "—", net: null, refunded: null };
	}
	if (order.payment_status === "unpaid") {
		// The Repair the workshop has not inspected yet: there is no agreed
		// number to show, and "Rp 0" would read as free (ADR-0018).
		return {
			label: order.has_unpriced_line ? "Pending price" : "Unpaid",
			net: null,
			refunded: null,
		};
	}

	const refunded = Number(order.refunded_amount);
	const net = Number(order.paid_amount) - refunded;

	return {
		label: formatMoney(String(net)),
		net,
		refunded: refunded > 0 ? formatMoney(order.refunded_amount) : null,
	};
};
