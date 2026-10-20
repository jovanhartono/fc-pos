import { Badge } from "@/components/ui/badge";
import type { DayCloseOrder } from "@/features/counter/api";
import {
	AmountCell,
	type AmountTone,
	OrderList,
	OrderRow,
	Tag,
} from "@/features/counter/components/day-close/order-row";
import { formatClock, formatDayShort } from "@/features/counter/lib/day-close";
import {
	formatOrderStatus,
	formatPaymentStatus,
	getOrderStatusBadgeVariant,
	getPaymentStatusBadgeVariant,
} from "@/lib/status";
import { pluralize } from "@/shared/utils";

interface PaymentBadgesProps {
	order: DayCloseOrder;
}

const PaymentBadges = ({ order }: PaymentBadgesProps) => {
	if (order.is_cancelled) {
		return (
			<Badge variant={getOrderStatusBadgeVariant("cancelled")}>
				{formatOrderStatus("cancelled")}
			</Badge>
		);
	}
	if (order.is_paid) {
		return <Badge variant="secondary">{order.payment_method_name}</Badge>;
	}
	// Paid on a later day: still unpaid when this day closed, so it keeps the
	// Unpaid badge and the later date sits beside it.
	return (
		<>
			<Badge variant={getPaymentStatusBadgeVariant("unpaid")}>
				{formatPaymentStatus("unpaid")}
			</Badge>
			{order.paid_day ? (
				<Tag tone="green">Paid {formatDayShort(order.paid_day)}</Tag>
			) : null}
		</>
	);
};

const amountToneOf = (order: DayCloseOrder): AmountTone => {
	if (order.is_cancelled) {
		return "cancelled";
	}
	return order.is_paid ? "paid" : "unpaid";
};

interface OrdersSheetContentProps {
	emptyText: string;
	orders: DayCloseOrder[];
}

export const OrdersSheetContent = ({
	emptyText,
	orders,
}: OrdersSheetContentProps) => (
	<OrderList emptyText={emptyText} isEmpty={orders.length === 0}>
		{orders.map((order) => (
			<OrderRow
				badges={<PaymentBadges order={order} />}
				code={order.order_code}
				customerName={order.customer_name}
				details={[
					formatClock(order.created_at),
					pluralize(order.items, "Item"),
				]}
				end={<AmountCell amount={order.amount} tone={amountToneOf(order)} />}
				key={order.order_id}
				orderId={order.order_id}
			/>
		))}
	</OrderList>
);
