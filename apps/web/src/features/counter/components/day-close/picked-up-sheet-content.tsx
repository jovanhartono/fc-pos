import type { DayClose, DayClosePickedUpOrder } from "@/features/counter/api";
import { OpenArrow } from "@/features/counter/components/day-close/open-arrow";
import {
	OrderList,
	OrderRow,
} from "@/features/counter/components/day-close/order-row";
import { formatDayShort } from "@/features/counter/lib/day-close";
import { formatClock } from "@/lib/dayjs";
import { pluralize } from "@/shared/utils";

interface PickedUpSheetContentProps {
	date: string;
	orders: DayClosePickedUpOrder[];
}

// Only a part pickup is coloured, so the cashier spots the Order whose other
// Items are still on the shelf.
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
					order.items_picked_by_day < order.items_total ? (
						<span className="whitespace-nowrap text-tone-warn-foreground tabular-nums">
							{order.items_picked_by_day} of {order.items_total} Items
						</span>
					) : (
						<span className="whitespace-nowrap tabular-nums">
							{pluralize(order.items, "Item")}
						</span>
					)
				}
				key={order.order_id}
				orderId={order.order_id}
			/>
		))}
	</OrderList>
);

interface PickedUpRowProps {
	data: DayClose;
	onOpen: (list: string) => void;
}

export const PickedUpRow = ({ data, onOpen }: PickedUpRowProps) => {
	const { picked_up: picked } = data;
	return (
		<button
			className="flex w-full items-baseline justify-between gap-3 rounded-lg border bg-card px-3 py-2.5 text-left enabled:hover:bg-muted"
			disabled={picked.orders === 0}
			onClick={() => onOpen("picked-up")}
			type="button"
		>
			<span>Picked up</span>
			<span className="tabular-nums">
				{pluralize(picked.orders, "Order")} · {pluralize(picked.items, "Item")}
				{picked.orders > 0 ? <OpenArrow /> : null}
			</span>
		</button>
	);
};
