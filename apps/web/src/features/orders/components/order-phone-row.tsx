import type { LinkProps } from "@tanstack/react-router";
import { MoneyValue } from "@/components/money-value";
import type { Order } from "@/features/orders/api";
import { NotifiedLabel } from "@/features/orders/components/notified-label";
import { OrderBadges } from "@/features/orders/components/order-badges";
import { OrderListRow } from "@/features/orders/components/order-list-row";

interface OrderPhoneRowProps {
	isActive: boolean;
	link: LinkProps;
	order: Order;
}

// The Orders list on a phone: one OrderListRow per Order, so about eight fit
// on a screen.
export const OrderPhoneRow = ({
	isActive,
	link,
	order,
}: OrderPhoneRowProps) => (
	<OrderListRow
		{...link}
		badges={
			<>
				{order.has_complaint ? (
					<span className="shrink-0 text-destructive text-footnote">
						COMPLAINT
					</span>
				) : null}
				{order.notified ? <NotifiedLabel className="shrink-0" /> : null}
			</>
		}
		className="rounded-none"
		hasCaret={false}
		details={[
			order.code,
			order.items_total > 0
				? `${order.items_ready}/${order.items_total}`
				: null,
		]}
		end={
			<div className="grid justify-items-end gap-1">
				<MoneyValue className="text-body" value={order.total} />
				<div className="flex gap-1">
					<OrderBadges order={order} />
				</div>
			</div>
		}
		isActive={isActive}
		title={order.customer_name}
	/>
);
