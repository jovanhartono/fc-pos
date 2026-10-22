import type { DayClosePickedUpOrder } from "@/features/counter/api";
import { EarlierTag } from "@/features/counter/components/day-close/earlier-tag";
import {
	OrderList,
	OrderRow,
} from "@/features/counter/components/day-close/order-row";
import { formatClock } from "@/lib/dayjs";
import { cn } from "@/lib/utils";
import { pluralize } from "@/shared/utils";

interface PickedProgressProps {
	picked: number;
	total: number;
}

// Drawn like the Orders list's "ready" bar, so a part pickup reads the same.
const PickedProgress = ({ picked, total }: PickedProgressProps) => {
	const isDone = picked === total;
	return (
		<span className="grid w-20 gap-1 justify-self-end">
			<span
				className={cn(
					"text-footnote tabular-nums",
					isDone && "text-tone-good-foreground",
				)}
			>
				{picked}/{total}
			</span>
			<span className="h-1.5 overflow-hidden rounded-full bg-soft-bar-track">
				<span
					className={cn(
						"block h-full rounded-full",
						isDone ? "bg-success" : "bg-primary",
					)}
					style={{ width: `${(picked / total) * 100}%` }}
				/>
			</span>
		</span>
	);
};

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
				badges={<EarlierTag createdDay={order.created_day} date={date} />}
				code={order.order_code}
				customerName={order.customer_name}
				details={[
					formatClock(order.picked_up_at),
					pluralize(order.items, "Item"),
				]}
				end={
					<PickedProgress
						picked={order.items_picked_by_day}
						total={order.items_total}
					/>
				}
				key={order.order_id}
				orderId={order.order_id}
			/>
		))}
	</OrderList>
);
