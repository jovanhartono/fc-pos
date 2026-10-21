import { Badge } from "@/components/ui/badge";
import type { Order } from "@/features/orders/api";
import {
	getPaymentBadges,
	type PaymentBadgeOrder,
} from "@/features/orders/lib/payment-badges";
import { formatOrderStatus, getOrderStatusBadgeVariant } from "@/lib/status";

interface PaymentBadgesProps {
	order: PaymentBadgeOrder;
}

export const PaymentBadges = ({ order }: PaymentBadgesProps) =>
	getPaymentBadges(order).map((badge) => (
		<Badge key={badge.label} variant={badge.variant}>
			{badge.label}
		</Badge>
	));

interface OrderBadgesProps {
	order: PaymentBadgeOrder & Pick<Order, "status">;
}

export const OrderBadges = ({ order }: OrderBadgesProps) => (
	<>
		<Badge variant={getOrderStatusBadgeVariant(order.status)}>
			{formatOrderStatus(order.status)}
		</Badge>
		<PaymentBadges order={order} />
	</>
);
