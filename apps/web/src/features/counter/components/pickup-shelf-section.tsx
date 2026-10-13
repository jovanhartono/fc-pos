import { Link } from "@tanstack/react-router";
import type { CounterPickupShelf } from "@/features/counter/api";
import { formatDays, whatsappUrl } from "@/features/counter/lib/format";
import { pluralize } from "@/shared/utils";

interface PickupShelfSectionProps {
	shelf: CounterPickupShelf;
	storeId: number;
}

export const PickupShelfSection = ({
	shelf,
	storeId,
}: PickupShelfSectionProps) => (
	<section className="grid gap-2.5">
		<h2 className="font-semibold text-[15px]">
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
							className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 border-border border-t px-3 py-2 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:gap-x-4"
							key={order.order_id}
						>
							<Link
								className="min-w-0 truncate hover:underline"
								params={{ orderId: String(order.order_id) }}
								to="/orders/$orderId"
							>
								{order.customer_name}
							</Link>
							<span className="text-right text-muted-foreground text-sm tabular-nums whitespace-nowrap sm:order-last">
								{`ready ${formatDays(order.ready_days)}`}
							</span>
							<span className="text-muted-foreground text-sm tabular-nums whitespace-nowrap">
								{pluralize(order.items, "Item")}
							</span>
							<a
								className="justify-self-end text-sm text-success underline underline-offset-2 whitespace-nowrap"
								href={whatsappUrl(order.customer_phone)}
								rel="noreferrer"
								target="_blank"
							>
								WhatsApp
							</a>
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
