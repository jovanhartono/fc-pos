import { useQuery } from "@tanstack/react-query";
import { type Order, ordersQueries } from "@/features/orders/api";
import { OrderListRow } from "@/features/orders/components/order-list-row";
import { useOpenNestedOrder } from "@/features/orders/hooks/useOpenNestedOrder";
import { formatMoney } from "@/shared/money";

const RADAR_LIMIT = 50;

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

	if (readyOrders.length === 0) {
		return (
			<p className="py-12 text-center text-body text-muted-foreground">
				No pickups right now.
			</p>
		);
	}

	return (
		<ul className="divide-y divide-border overflow-hidden rounded-lg border bg-card">
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
