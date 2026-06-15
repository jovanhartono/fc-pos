import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { SelectField } from "@/components/form/select-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useOrderPaymentMutation } from "@/features/orders/hooks/useOrderMutations";
import { paymentMethodsQueryOptions } from "@/lib/query-options";

interface OrderPaymentCardProps {
	orderId: number;
}

export const OrderPaymentCard = ({ orderId }: OrderPaymentCardProps) => {
	const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState("");
	const paymentMethodsQuery = useQuery(paymentMethodsQueryOptions());
	const paymentMutation = useOrderPaymentMutation(orderId);

	const paymentMethods = Array.isArray(paymentMethodsQuery.data)
		? paymentMethodsQuery.data
		: [];

	return (
		<Card>
			<CardHeader>
				<CardTitle>Payment</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-3">
				<SelectField
					items={paymentMethods.map((method) => ({
						value: String(method.id),
						label: method.name,
					}))}
					value={selectedPaymentMethodId}
					onValueChange={setSelectedPaymentMethodId}
					placeholder="Select payment method"
					className="w-full"
				/>
				<Button
					disabled={paymentMutation.isPending || !selectedPaymentMethodId}
					onClick={async () => {
						await paymentMutation.mutateAsync(Number(selectedPaymentMethodId));
					}}
				>
					Mark as paid
				</Button>
			</CardContent>
		</Card>
	);
};
