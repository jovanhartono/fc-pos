import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
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
				<Select
					value={selectedPaymentMethodId}
					onValueChange={(value) => setSelectedPaymentMethodId(value ?? "")}
				>
					<SelectTrigger size="md" className="w-full">
						<SelectValue placeholder="Select payment method" />
					</SelectTrigger>
					<SelectContent>
						{paymentMethods.map((method) => (
							<SelectItem key={method.id} value={String(method.id)}>
								{method.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
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
