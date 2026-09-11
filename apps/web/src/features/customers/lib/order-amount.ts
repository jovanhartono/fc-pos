import { formatIDRCurrency } from "@/shared/utils";

export interface OrderAmountState {
	has_unpriced_line: boolean;
	paid_amount: string;
	payment_status: "paid" | "unpaid";
	refunded_amount: string;
}

export interface OrderAmountDisplay {
	/** Secondary line, present only when money went back out. */
	refunded: string | null;
	/** True when the row carries no number — style it as absent, not as zero. */
	isPending: boolean;
	label: string;
}

// What one Order contributed to this customer's Lifetime spend, read off the
// row: a paid Order shows what the shop kept, collected minus anything
// refunded, on the same rule the header figure is summed from.
export const describeOrderAmount = (
	order: OrderAmountState,
): OrderAmountDisplay => {
	if (order.payment_status === "unpaid") {
		// The Repair the workshop has not inspected yet: there is no agreed
		// number to show, and "Rp 0" would read as free (ADR-0018).
		return {
			isPending: true,
			label: order.has_unpriced_line ? "Pending price" : "Unpaid",
			refunded: null,
		};
	}

	const refunded = Number(order.refunded_amount);
	const net = Number(order.paid_amount) - refunded;

	return {
		isPending: false,
		label: formatIDRCurrency(String(net)),
		refunded: refunded > 0 ? formatIDRCurrency(order.refunded_amount) : null,
	};
};
