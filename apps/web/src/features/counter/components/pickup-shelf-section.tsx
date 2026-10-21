import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import { Section } from "@/components/section";
import { WhatsappIcon } from "@/components/whatsapp-icon";
import type { CounterPickupShelf } from "@/features/counter/api";
import { formatDays } from "@/features/counter/lib/format";
import { NotifiedLabel } from "@/features/orders/components/notified-label";
import { OrderListRow } from "@/features/orders/components/order-list-row";
import { useNotifyCustomer } from "@/features/orders/hooks/useNotifyCustomer";
import { pluralize } from "@/shared/utils";

type ShelfOrder = CounterPickupShelf["oldest"][number];

interface ShelfNotifyActionProps {
	order: ShelfOrder;
}

const ShelfNotifyAction = ({ order }: ShelfNotifyActionProps) => {
	const notifyCustomer = useNotifyCustomer(order.order_id);

	return (
		<button
			className="inline-flex items-center gap-1 font-medium text-body text-tone-good-foreground whitespace-nowrap hover:text-tone-good-foreground/80"
			onClick={() =>
				notifyCustomer({
					customerName: order.customer_name,
					phone: order.customer_phone,
					lastNotice: null,
				})
			}
			type="button"
		>
			<HugeiconsIcon
				icon={WhatsappIcon}
				aria-hidden="true"
				className="size-4"
			/>
			Notify
		</button>
	);
};

interface ShelfRowProps {
	isActive: boolean;
	isWide: boolean;
	order: ShelfOrder;
}

const ShelfRow = ({ isActive, isWide, order }: ShelfRowProps) => {
	const rowProps = {
		action: order.notified ? undefined : <ShelfNotifyAction order={order} />,
		badges: order.notified ? <NotifiedLabel /> : undefined,
		className: "rounded-none px-3",
		details: [
			`ready ${formatDays(order.ready_days)}`,
			pluralize(order.items, "Item"),
		],
		isActive,
		title: order.customer_name,
	};

	if (isWide) {
		return (
			<OrderListRow
				{...rowProps}
				from="/counter"
				replace
				resetScroll={false}
				search={(prev) => ({ ...prev, open: order.order_id })}
			/>
		);
	}
	return (
		<OrderListRow
			{...rowProps}
			params={{ orderId: String(order.order_id) }}
			to="/orders/$orderId"
		/>
	);
};

interface PickupShelfSectionProps {
	isWide: boolean;
	openOrderId?: number;
	shelf: CounterPickupShelf;
	storeId: number;
}

export const PickupShelfSection = ({
	isWide,
	openOrderId,
	shelf,
	storeId,
}: PickupShelfSectionProps) => (
	<Section
		count={`${pluralize(shelf.orders, "Order")} · ${pluralize(shelf.items, "Item")}`}
		empty="Nothing on the shelf."
		title="Pickup shelf"
	>
		{shelf.orders === 0 ? null : (
			<div className="overflow-hidden rounded-lg border bg-card">
				<ul className="divide-y divide-border">
					{shelf.oldest.map((order) => (
						<li key={order.order_id}>
							<ShelfRow
								isActive={order.order_id === openOrderId}
								isWide={isWide}
								order={order}
							/>
						</li>
					))}
				</ul>
				<Link
					className="block border-border border-t px-3 py-2 font-medium hover:bg-muted"
					search={{ page: 1, status: "ready_for_pickup", storeId }}
					to="/orders"
				>
					All {shelf.orders} ready {shelf.orders === 1 ? "Order" : "Orders"} →
				</Link>
			</div>
		)}
	</Section>
);
