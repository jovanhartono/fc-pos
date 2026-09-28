import { Badge } from "@/components/ui/badge";
import {
	isCancelledBeforePayment,
	type OrderPaymentState,
} from "@/features/orders/lib/order-action-gates";
import {
	formatPaymentStatus,
	getPaymentStatusBadgeVariant,
} from "@/lib/status";

interface PaymentStatusBadgeProps {
	order: OrderPaymentState;
}

export const PaymentStatusBadge = ({ order }: PaymentStatusBadgeProps) => {
	if (isCancelledBeforePayment(order)) {
		return null;
	}

	return (
		<Badge variant={getPaymentStatusBadgeVariant(order.payment_status)}>
			{formatPaymentStatus(order.payment_status)}
		</Badge>
	);
};
