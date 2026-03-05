import { useQuery } from "@tanstack/react-query";
import { Combobox } from "@/components/ui/combobox";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { fetchPaymentMethods, queryKeys } from "@/lib/api";

type PaymentMethodAutocompleteProps = {
	value: string;
	onValueChange: (value: string) => void;
	disabled?: boolean;
	error?: { message?: string };
};

export function PaymentMethodAutocomplete({
	value,
	onValueChange,
	disabled,
	error,
}: PaymentMethodAutocompleteProps) {
	const { data: paymentMethods = [], isPending } = useQuery({
		queryKey: queryKeys.paymentMethods,
		queryFn: fetchPaymentMethods,
	});

	return (
		<Field data-invalid={!!error}>
			<FieldLabel htmlFor="order-payment-method">Payment Method</FieldLabel>
			<Combobox
				id="order-payment-method"
				triggerClassName="h-10 w-full text-sm"
				options={[
					{ value: "none", label: "No payment method" },
					...paymentMethods.map((paymentMethod) => ({
						value: String(paymentMethod.id),
						label: paymentMethod.name,
					})),
				]}
				value={value || "none"}
				onValueChange={(nextValue) =>
					onValueChange(!nextValue || nextValue === "none" ? "" : nextValue)
				}
				loading={isPending}
				placeholder="No payment method"
				searchPlaceholder="Search payment method..."
				emptyText="No payment method found"
				disabled={disabled}
			/>
			<FieldError errors={[error]} />
		</Field>
	);
}
