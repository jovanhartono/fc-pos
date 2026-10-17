import { WhatsappLogoIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { CounterPickupShelf } from "@/features/counter/api";
import { formatDays } from "@/features/counter/lib/format";
import { NotifiedLabel } from "@/features/orders/components/notified-label";
import { useNotifyCustomer } from "@/features/orders/hooks/useNotifyCustomer";
import { cn, pluralize } from "@/shared/utils";

interface ShelfOrderLinkProps {
	customerName: string;
	isWide: boolean;
	orderId: number;
}

const ShelfOrderLink = ({
	customerName,
	isWide,
	orderId,
}: ShelfOrderLinkProps) => {
	// Closing the sheet hands focus back here; the row shows it, not a box.
	const className =
		"min-w-0 truncate outline-none hover:underline focus-visible:underline";
	if (isWide) {
		return (
			<Link
				className={className}
				from="/counter"
				replace
				resetScroll={false}
				search={(prev) => ({ ...prev, open: orderId })}
			>
				{customerName}
			</Link>
		);
	}
	return (
		<Link
			className={className}
			params={{ orderId: String(orderId) }}
			to="/orders/$orderId"
		>
			{customerName}
		</Link>
	);
};

interface ShelfNotifyActionProps {
	order: CounterPickupShelf["oldest"][number];
}

const ShelfNotifyAction = ({ order }: ShelfNotifyActionProps) => {
	const notifyCustomer = useNotifyCustomer(order.order_id);

	if (order.notified) {
		return <NotifiedLabel className="justify-self-end" />;
	}
	return (
		<button
			className="inline-flex items-center gap-1 justify-self-end font-medium text-emerald-700 text-sm whitespace-nowrap hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300"
			onClick={() =>
				notifyCustomer({
					customerName: order.customer_name,
					phone: order.customer_phone,
					lastNotice: null,
				})
			}
			type="button"
		>
			<WhatsappLogoIcon aria-hidden="true" className="size-4" />
			Notify
		</button>
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
	<section className="grid gap-2.5">
		<h2 className="font-medium text-[15px]">
			Pickup shelf
			<span className="font-normal text-muted-foreground">
				{" "}
				· {pluralize(shelf.orders, "Order")} · {pluralize(shelf.items, "Item")}
			</span>
		</h2>
		{shelf.orders === 0 ? (
			<p className="text-muted-foreground">Nothing on the shelf.</p>
		) : (
			<div className="border border-border">
				<ul>
					{shelf.oldest.map((order) => (
						<li
							className={cn(
								"grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 border-border border-t px-3 py-2 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:gap-x-4 has-[a:focus-visible]:bg-muted",
								order.order_id === openOrderId && "bg-muted",
							)}
							key={order.order_id}
						>
							<ShelfOrderLink
								customerName={order.customer_name}
								isWide={isWide}
								orderId={order.order_id}
							/>
							<span className="text-right text-muted-foreground text-sm tabular-nums whitespace-nowrap sm:order-last">
								{`ready ${formatDays(order.ready_days)}`}
							</span>
							<span className="text-muted-foreground text-sm tabular-nums whitespace-nowrap">
								{pluralize(order.items, "Item")}
							</span>
							<ShelfNotifyAction order={order} />
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
	</section>
);
