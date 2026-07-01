import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { SelectField } from "@/components/form/select-field";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { OrderMoneySummary } from "@/features/orders/components/order-money-summary";
import { OrderSectionHeader } from "@/features/orders/components/order-section-header";
import { useOrderPaymentMutation } from "@/features/orders/hooks/useOrderMutations";
import { formatOrderDateTime } from "@/features/orders/lib/format";
import type { OrderActionGates } from "@/features/orders/lib/order-action-gates";
import type { OrderDetail } from "@/lib/api";
import { paymentMethodsQueryOptions } from "@/lib/query-options";

interface OrderPaymentSectionProps {
	orderId: number;
	detail: OrderDetail;
	gates: OrderActionGates;
}

export const OrderPaymentSection = ({
	orderId,
	detail,
	gates,
}: OrderPaymentSectionProps) => (
	<Card className="gap-0 overflow-hidden py-0">
		<OrderSectionHeader>Payment</OrderSectionHeader>
		<div className="border-t">
			<OrderMoneySummary detail={detail} />
		</div>
		<PaymentDetails detail={detail} gates={gates} orderId={orderId} />
	</Card>
);

// Payment status itself is shown in the header status chip (OrderIdentityStrip),
// so this section adds only the extra detail — how it was paid, or the control
// to collect it — and renders nothing when there is neither (unpaid, no rights).
const PaymentDetails = ({
	orderId,
	detail,
	gates,
}: OrderPaymentSectionProps) => {
	if (detail.payment_status === "paid") {
		return (
			<>
				<Separator />
				<PaidDetails detail={detail} />
			</>
		);
	}
	if (gates.isPaymentAllowed) {
		return (
			<>
				<Separator />
				<CollectPaymentForm orderId={orderId} />
			</>
		);
	}
	return null;
};

const PaidDetails = ({ detail }: { detail: OrderDetail }) => (
	<dl className="grid gap-2 px-4 py-4 text-sm">
		<div className="flex items-center justify-between gap-4">
			<dt className="text-muted-foreground">Method</dt>
			<dd className="font-medium">{detail.paymentMethod?.name ?? "—"}</dd>
		</div>
		{detail.paid_at ? (
			<div className="flex items-center justify-between gap-4">
				<dt className="text-muted-foreground">Paid at</dt>
				<dd className="tabular-nums">{formatOrderDateTime(detail.paid_at)}</dd>
			</div>
		) : null}
	</dl>
);

const CollectPaymentForm = ({ orderId }: { orderId: number }) => {
	const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState("");
	const paymentMethodsQuery = useQuery(paymentMethodsQueryOptions());
	const paymentMutation = useOrderPaymentMutation(orderId);

	const paymentMethods = Array.isArray(paymentMethodsQuery.data)
		? paymentMethodsQuery.data
		: [];

	return (
		<div className="grid gap-3 px-4 py-4">
			<SelectField
				className="w-full"
				items={paymentMethods.map((method) => ({
					value: String(method.id),
					label: method.name,
				}))}
				onValueChange={setSelectedPaymentMethodId}
				placeholder="Select payment method"
				value={selectedPaymentMethodId}
			/>
			<Button
				className="h-11"
				disabled={paymentMutation.isPending || !selectedPaymentMethodId}
				onClick={async () => {
					await paymentMutation.mutateAsync(Number(selectedPaymentMethodId));
				}}
				type="button"
			>
				Mark as paid
			</Button>
		</div>
	);
};
