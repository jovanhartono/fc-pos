import type { LinkProps } from "@tanstack/react-router";
import { MoneyValue } from "@/components/money-value";
import { Badge } from "@/components/ui/badge";
import type { Order } from "@/features/orders/api";
import { NotifiedLabel } from "@/features/orders/components/notified-label";
import { OrderListRow } from "@/features/orders/components/order-list-row";
import { getPaymentBadges } from "@/features/orders/lib/payment-badges";
import { formatOrderStatus, getOrderStatusBadgeVariant } from "@/lib/status";

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
		className="rounded-none border-0 px-4"
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
					<Badge variant={getOrderStatusBadgeVariant(order.status)}>
						{formatOrderStatus(order.status)}
					</Badge>
					{getPaymentBadges(order).map((badge) => (
						<Badge key={badge.label} variant={badge.variant}>
							{badge.label}
						</Badge>
					))}
				</div>
			</div>
		}
		isActive={isActive}
		title={order.customer_name}
	/>
);
