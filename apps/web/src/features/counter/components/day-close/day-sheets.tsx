import type { DayClose } from "@/features/counter/api";
import { OrdersSheetContent } from "@/features/counter/components/day-close/orders-sheet-content";
import { PaymentsSheetContent } from "@/features/counter/components/day-close/payments-sheet-content";
import { PickedUpSheetContent } from "@/features/counter/components/day-close/picked-up-sheet-content";
import { RefundsSheetContent } from "@/features/counter/components/day-close/refunds-section";
import {
	formatDayLong,
	groupBySlip,
	splitMethodName,
	unpaidOrdersOf,
} from "@/features/counter/lib/day-close";
import { formatMoney } from "@/shared/money";
import { pluralize } from "@/shared/utils";
import type { OpenSheetPayload } from "@/stores/sheet-store";

const sum = (rows: { amount: number }[]) =>
	rows.reduce((total, row) => total + row.amount, 0);

const methodSheet = (data: DayClose, title: string) => {
	const group = groupBySlip(data.methods).find((g) => g.slip === title);
	const lines =
		group?.lines ?? data.methods.filter((method) => method.name === title);
	if (lines.length === 0) {
		return null;
	}
	const ids = new Set(lines.map((line) => line.payment_method_id));
	const payments = data.payments.filter((payment) =>
		ids.has(payment.payment_method_id),
	);
	return {
		title,
		description: `${formatDayLong(data.date)} · ${pluralize(payments.length, "payment")} · ${formatMoney(sum(payments))}`,
		size: "wide",
		content: () => (
			<PaymentsSheetContent
				date={data.date}
				lineOf={
					lines.length > 1
						? (payment) => splitMethodName(payment.payment_method_name).line
						: null
				}
				payments={payments}
			/>
		),
	} satisfies OpenSheetPayload;
};

// The Summary list open in the sheet is kept in the URL as ?list= ("unpaid",
// "orders", "picked-up", "refunds", "method:<name>"), so a phone's back button
// from an Order lands on the same list.
export const daySheet = (
	list: string,
	data: DayClose,
	dayLabel: string,
): OpenSheetPayload | null => {
	const day = formatDayLong(data.date);
	const { dropped_off: dropped, picked_up: picked } = data;

	if (list.startsWith("method:")) {
		return methodSheet(data, list.slice("method:".length));
	}
	switch (list) {
		case "unpaid": {
			const orders = unpaidOrdersOf(data);
			return {
				title: "Unpaid Orders",
				description: `${day} · ${pluralize(orders.length, "Order")} · ${formatMoney(sum(orders))}`,
				size: "wide",
				content: () => (
					<OrdersSheetContent
						emptyText="Nothing unpaid this day."
						orders={orders}
					/>
				),
			};
		}
		case "orders":
			return {
				title: `${dayLabel} Orders`,
				description: `${day} · ${pluralize(dropped.orders, "Order")}`,
				size: "wide",
				content: () => (
					<OrdersSheetContent
						emptyText="No Orders dropped off this day."
						orders={dropped.order_list}
					/>
				),
			};
		case "picked-up":
			return {
				title: "Picked up",
				description: `${day} · ${pluralize(picked.orders, "Order")} · ${pluralize(picked.items, "Item")}`,
				size: "wide",
				content: () => (
					<PickedUpSheetContent date={data.date} orders={picked.order_list} />
				),
			};
		case "refunds":
			return {
				title: "Refunds",
				description: `${day} · ${pluralize(data.refunds.length, "refund")} · ${formatMoney(sum(data.refunds))}`,
				size: "wide",
				content: () => (
					<RefundsSheetContent date={data.date} refunds={data.refunds} />
				),
			};
		default:
			return null;
	}
};
