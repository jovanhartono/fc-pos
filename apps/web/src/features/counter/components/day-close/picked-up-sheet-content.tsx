import type { DayClosePickedUpOrder } from "@/features/counter/api";
import { EarlierTag } from "@/features/counter/components/day-close/earlier-tag";
import {
	OrderCode,
	OrderRow,
} from "@/features/counter/components/day-close/order-row";
import { formatClock } from "@/features/counter/lib/day-close";
import { pluralize } from "@/shared/utils";

interface PickedUpSheetContentProps {
	date: string;
	orders: DayClosePickedUpOrder[];
}

export const PickedUpSheetContent = ({
	date,
	orders,
}: PickedUpSheetContentProps) => (
	<ul>
		{orders.map((order) => (
			<OrderRow
				className="grid-cols-[auto_minmax(0,1fr)_auto]"
				code={order.order_code}
				key={order.order_id}
				orderId={order.order_id}
			>
				<span className="text-muted-foreground tabular-nums">
					{formatClock(order.picked_up_at)}
				</span>
				<span>
					<OrderCode code={order.order_code} />
					<EarlierTag createdDay={order.created_day} date={date} />
				</span>
				<span className="whitespace-nowrap text-muted-foreground tabular-nums">
					{pluralize(order.items, "Item")}
				</span>
			</OrderRow>
		))}
	</ul>
);
