import { Badge } from "@/components/ui/badge";
import type { DayCloseOrder } from "@/features/counter/api";
import {
	OrderCode,
	OrderRow,
} from "@/features/counter/components/day-close/order-row";
import { formatClock, formatDayShort } from "@/features/counter/lib/day-close";
import { useIsMobile } from "@/hooks/use-mobile";
import {
	formatOrderStatus,
	formatPaymentStatus,
	getOrderStatusBadgeVariant,
	getPaymentStatusBadgeVariant,
} from "@/lib/status";
import { formatMoney } from "@/shared/money";
import { pluralize } from "@/shared/utils";

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
	if (order.paid_day) {
		return (
			<Badge variant={getPaymentStatusBadgeVariant("paid")}>
				Paid {formatDayShort(order.paid_day)}
			</Badge>
		);
	}
	return (
		<Badge variant={getPaymentStatusBadgeVariant("unpaid")}>
			{formatPaymentStatus("unpaid")}
		</Badge>
	);
};

interface OrdersSheetContentProps {
	orders: DayCloseOrder[];
}

export const OrdersSheetContent = ({ orders }: OrdersSheetContentProps) => {
	const isMobile = useIsMobile();

	if (orders.length === 0) {
		return <p className="text-muted-foreground">No Orders dropped off.</p>;
	}

	if (isMobile) {
		return (
			<ul>
				{orders.map((order) => (
					<OrderRow
						className="grid-cols-[minmax(0,1fr)_auto] gap-y-0.5"
						code={order.order_code}
						key={order.order_id}
						orderId={order.order_id}
					>
						<OrderCode code={order.order_code} />
						<span className="tabular-nums">{formatMoney(order.amount)}</span>
						<span className="col-span-full flex flex-wrap items-baseline gap-x-1.5 text-muted-foreground text-xs">
							{formatClock(order.created_at)} · {pluralize(order.items, "Item")}{" "}
							· <PaymentCell order={order} />
						</span>
					</OrderRow>
				))}
			</ul>
		);
	}

	return (
		<ul className="text-sm">
			{orders.map((order) => (
				<OrderRow
					className="grid-cols-[3rem_10rem_4.5rem_minmax(0,1fr)_7rem]"
					code={order.order_code}
					key={order.order_id}
					orderId={order.order_id}
				>
					<span className="text-muted-foreground tabular-nums">
						{formatClock(order.created_at)}
					</span>
					<OrderCode code={order.order_code} />
					<span className="whitespace-nowrap text-muted-foreground tabular-nums">
						{pluralize(order.items, "Item")}
					</span>
					<span>
						<PaymentCell order={order} />
					</span>
					<span className="text-right tabular-nums">
						{formatMoney(order.amount)}
					</span>
				</OrderRow>
			))}
		</ul>
	);
};
