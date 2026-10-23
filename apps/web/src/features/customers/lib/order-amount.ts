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
	label: string;
	/** What the shop kept; null when the row carries no number — show the label
	 * as absent, not as zero. */
	net: number | null;
}

// What one Order added to the Customer's Lifetime spend: collected minus
// refunded, the same rule the header figure is summed from.
export const describeOrderAmount = (
	order: OrderAmountState,
): OrderAmountDisplay => {
	if (isCancelledBeforePayment(order)) {
		return { label: "", net: null };
	}
	if (order.payment_status === "unpaid") {
		// A Repair not inspected yet has no agreed price, and "Rp 0" would read
		// as free (ADR-0018).
		return {
			label: order.has_unpriced_line ? "Pending price" : "Unpaid",
			net: null,
		};
	}

	const net = Number(order.paid_amount) - Number(order.refunded_amount);

	return { label: formatMoney(String(net)), net };
};
