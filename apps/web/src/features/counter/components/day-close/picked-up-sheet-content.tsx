import type { DayClosePickedUpOrder } from "@/features/counter/api";
import {
	OrderList,
	OrderRow,
} from "@/features/counter/components/day-close/order-row";
import { formatDayShort } from "@/features/counter/lib/day-close";
import { ItemsProgress } from "@/features/orders/components/items-progress";
import { formatClock } from "@/lib/dayjs";

interface PickedUpSheetContentProps {
	date: string;
	orders: DayClosePickedUpOrder[];
}

export const PickedUpSheetContent = ({
	date,
	orders,
}: PickedUpSheetContentProps) => (
	<OrderList
		emptyText="Nothing picked up this day."
		isEmpty={orders.length === 0}
	>
		{orders.map((order) => (
			<OrderRow
				code={order.order_code}
				customerName={order.customer_name}
				details={[
					formatClock(order.picked_up_at),
					order.created_day === date
						? null
						: `from ${formatDayShort(order.created_day)}`,
				]}
				end={
					<ItemsProgress
						done={order.items_picked_by_day}
						total={order.items_total}
					/>
				}
				key={order.order_id}
				orderId={order.order_id}
			/>
		))}
	</OrderList>
);
