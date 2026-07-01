import { Badge } from "@/components/ui/badge";
import type { OrderDetail } from "@/lib/api";
import {
	formatPaymentStatus,
	getPaymentStatusBadgeVariant,
} from "@/lib/status";

interface PaymentStatusBadgeProps {
	status: OrderDetail["payment_status"];
}

export const PaymentStatusBadge = ({ status }: PaymentStatusBadgeProps) => (
	<Badge variant={getPaymentStatusBadgeVariant(status)}>
		{formatPaymentStatus(status)}
	</Badge>
);
