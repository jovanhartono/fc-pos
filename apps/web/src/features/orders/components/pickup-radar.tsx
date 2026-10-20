import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { type Order, ordersQueries } from "@/features/orders/api";
import { OrderListRow } from "@/features/orders/components/order-list-row";
import { useOpenNestedOrder } from "@/features/orders/hooks/useOpenNestedOrder";
import { CONTENT_FADE } from "@/lib/content-fade";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/shared/money";

const RADAR_LIMIT = 50;
const SKELETON_ROW_COUNT = 8;

interface PickupRadarProps {
	enabled: boolean;
	storeId?: number;
}

// The sheet asks for the ready rack itself rather than sifting the page of
// orders behind it — a counter on page three would otherwise see an empty rack.
export const PickupRadar = ({ enabled, storeId }: PickupRadarProps) => {
	const readyQuery = useQuery({
		...ordersQueries.list({
			status: "ready_for_pickup",
			store_id: storeId,
			limit: RADAR_LIMIT,
		}),
		enabled,
	});
	const readyOrders = readyQuery.data?.items ?? [];

	// Rows shaped like the ready Orders, not "No pickups", while the rack loads.
	if (readyQuery.isPending && enabled) {
		return (
			<ul
				aria-hidden
				className="divide-y divide-border overflow-hidden rounded-lg border bg-card"
			>
				{Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
					<li key={index} className="grid gap-0.5 px-4 py-3">
						<Skeleton className="my-0.5 h-4 w-2/3" />
						<Skeleton className="my-0.5 h-3 w-1/3" />
					</li>
				))}
			</ul>
		);
	}

	if (readyOrders.length === 0) {
		return (
			<p
				className={cn(
					"py-12 text-center text-body text-muted-foreground",
					CONTENT_FADE,
				)}
			>
				No pickups right now.
			</p>
		);
	}

	return (
		<ul
			className={cn(
				"divide-y divide-border overflow-hidden rounded-lg border bg-card",
				CONTENT_FADE,
			)}
		>
			{readyOrders.map((order) => (
				<li key={order.id}>
					<RadarRow order={order} />
				</li>
			))}
		</ul>
	);
};

interface RadarRowProps {
	order: Order;
}

const RadarRow = ({ order }: RadarRowProps) => {
	const handleOpen = useOpenNestedOrder(order.id, order.code);

	return (
		<OrderListRow
			className="rounded-none border-0 px-4"
			details={[order.code, order.store_name]}
			end={
				<p className="font-medium text-body text-foreground tabular-nums">
					{formatMoney(order.total)}
				</p>
			}
			onClick={handleOpen}
			params={{ orderId: String(order.id) }}
			title={order.customer_name}
			to="/orders/$orderId"
		/>
	);
};
