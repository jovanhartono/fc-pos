import { Badge } from "@/components/ui/badge";
import type { DayCloseOrder } from "@/features/counter/api";
import {
	AmountCell,
	type AmountTone,
	OrderCustomer,
	OrderList,
	OrderRow,
	PhoneRowContent,
	Tag,
	TimeCell,
} from "@/features/counter/components/day-close/order-row";
import { formatClock, formatDayShort } from "@/features/counter/lib/day-close";
import { useIsMobile } from "@/hooks/use-mobile";
import {
	formatOrderStatus,
	formatPaymentStatus,
	getOrderStatusBadgeVariant,
	getPaymentStatusBadgeVariant,
} from "@/lib/status";
import { pluralize } from "@/shared/utils";

const COLUMNS = "grid-cols-[3.5rem_minmax(0,1fr)_4.5rem_11rem_7.5rem]";

interface PaymentCellProps {
	order: DayCloseOrder;
}

const PaymentCell = ({ order }: PaymentCellProps) => {
	if (order.is_cancelled) {
		return (
			<Badge variant={getOrderStatusBadgeVariant("cancelled")}>
				{formatOrderStatus("cancelled")}
			</Badge>
		);
	}
	if (order.is_paid) {
		return <span>{order.payment_method_name}</span>;
	}
	// Paid on a later day: still unpaid when this day closed, so it keeps the
	// Unpaid badge and the later date sits beside it.
	return (
		<span className="inline-flex flex-wrap items-center gap-y-1">
			<Badge variant={getPaymentStatusBadgeVariant("unpaid")}>
				{formatPaymentStatus("unpaid")}
			</Badge>
			{order.paid_day ? (
				<Tag tone="green">Paid {formatDayShort(order.paid_day)}</Tag>
			) : null}
		</span>
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
}: OrdersSheetContentProps) => {
	const isMobile = useIsMobile();

	return (
		<OrderList
			columns={COLUMNS}
			emptyText={emptyText}
			headings={["Time", "Customer", "Items", "Payment", "Amount"]}
			isEmpty={orders.length === 0}
		>
			{orders.map((order) => {
				const amount = (
					<AmountCell amount={order.amount} tone={amountToneOf(order)} />
				);
				return (
					<OrderRow
						columns={COLUMNS}
						code={order.order_code}
						key={order.order_id}
						orderId={order.order_id}
					>
						{isMobile ? (
							<PhoneRowContent
								customerName={order.customer_name}
								value={amount}
							>
								<span>{formatClock(order.created_at)}</span>
								<span className="font-mono">{order.order_code}</span>
								<span>{pluralize(order.items, "Item")}</span>
								<span>
									<PaymentCell order={order} />
								</span>
							</PhoneRowContent>
						) : (
							<>
								<TimeCell at={order.created_at} />
								<OrderCustomer
									code={order.order_code}
									customerName={order.customer_name}
								/>
								<span className="whitespace-nowrap tabular-nums">
									{pluralize(order.items, "Item")}
								</span>
								<span>
									<PaymentCell order={order} />
								</span>
								{amount}
							</>
						)}
					</OrderRow>
				);
			})}
		</OrderList>
	);
};
