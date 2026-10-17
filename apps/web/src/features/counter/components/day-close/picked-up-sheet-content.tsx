import type { DayClosePickedUpOrder } from "@/features/counter/api";
import { EarlierTag } from "@/features/counter/components/day-close/earlier-tag";
import {
	OrderCustomer,
	OrderList,
	OrderRow,
	PhoneRowContent,
	TimeCell,
} from "@/features/counter/components/day-close/order-row";
import { formatClock } from "@/features/counter/lib/day-close";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { pluralize } from "@/shared/utils";

const COLUMNS = "grid-cols-[3.5rem_minmax(0,1fr)_6rem_5rem]";

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
					"text-xs tabular-nums",
					isDone && "text-emerald-700 dark:text-emerald-300",
				)}
			>
				{picked}/{total}
			</span>
			<span className="h-1 bg-muted">
				<span
					className={cn(
						"block h-full",
						isDone ? "bg-success" : "bg-foreground",
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
}: PickedUpSheetContentProps) => {
	const isMobile = useIsMobile();

	return (
		<OrderList
			columns={COLUMNS}
			emptyText="Nothing picked up this day."
			headings={["Time", "Customer", "This pickup", "Picked up"]}
			isEmpty={orders.length === 0}
		>
			{orders.map((order) => {
				const progress = (
					<PickedProgress
						picked={order.items_picked_by_day}
						total={order.items_total}
					/>
				);
				const earlier = (
					<EarlierTag createdDay={order.created_day} date={date} />
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
								value={progress}
							>
								<span>{formatClock(order.picked_up_at)}</span>
								<span>
									<span className="font-mono">{order.order_code}</span>
									{earlier}
								</span>
								<span>{pluralize(order.items, "Item")}</span>
							</PhoneRowContent>
						) : (
							<>
								<TimeCell at={order.picked_up_at} />
								<OrderCustomer
									code={order.order_code}
									customerName={order.customer_name}
								>
									{earlier}
								</OrderCustomer>
								<span className="whitespace-nowrap tabular-nums">
									{pluralize(order.items, "Item")}
								</span>
								{progress}
							</>
						)}
					</OrderRow>
				);
			})}
		</OrderList>
	);
};
