import { zodResolver } from "@hookform/resolvers/zod";
import { CheckIcon } from "@phosphor-icons/react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { CurrencyInput } from "@/components/form/currency-input";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { useSetServicePriceMutation } from "@/features/orders/hooks/useOrderMutations";

const servicePriceSchema = z.object({
	// Zero is deliberately free (a Rework), never a keyed price.
	price: z
		.string()
		.trim()
		.refine((value) => Number(value) > 0, "Price is required."),
});

type ServicePriceValues = z.infer<typeof servicePriceSchema>;

interface OrderServicePriceFormProps {
	orderId: number;
	serviceId: number;
	// null = the line is still blank (Repair awaiting inspection); a value
	// means this submit is a correction on an unpaid order.
	currentPrice: string | null;
	onSuccess?: () => void;
}

// ADR-0018: setting or correcting a line's price is open to any staff — the
// oversight is the server-side price log (who keyed what, from what), not a
// role gate. Payment freezes prices; the server refuses this after paid.
export const OrderServicePriceForm = ({
	orderId,
	serviceId,
	currentPrice,
	onSuccess,
}: OrderServicePriceFormProps) => {
	const priceMutation = useSetServicePriceMutation(orderId);
	const form = useForm<ServicePriceValues>({
		resolver: zodResolver(servicePriceSchema),
		defaultValues: { price: currentPrice ?? "" },
	});

	return (
		<form
			className="grid gap-3"
			// mutate, not mutateAsync: if someone else priced or cancelled this
			// line first, the global handler shows the server's reason. Awaiting
			// it here throws instead, leaving staff with a spinner that stops
			// and no message.
			onSubmit={form.handleSubmit((values) => {
				priceMutation.mutate(
					{
						serviceId,
						payload: { price: values.price },
					},
					{ onSuccess },
				);
			})}
		>
			<Controller
				control={form.control}
				name="price"
				render={({ field, fieldState }) => (
					<Field data-invalid={fieldState.invalid}>
						<FieldLabel asterisk htmlFor={`service-price-${serviceId}`}>
							Price
						</FieldLabel>
						<CurrencyInput
							id={`service-price-${serviceId}`}
							onValueChange={field.onChange}
							required
							value={field.value}
						/>
						<FieldError errors={[fieldState.error]} />
					</Field>
				)}
			/>
			<Button
				className="h-10 pointer-coarse:h-11"
				icon={<CheckIcon className="size-4" />}
				loading={priceMutation.isPending}
				type="submit"
			>
				{currentPrice === null ? "Set price" : "Update price"}
			</Button>
		</form>
	);
};
