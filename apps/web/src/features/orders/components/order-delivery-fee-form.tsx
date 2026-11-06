import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { CurrencyInput } from "@/components/form/currency-input";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { useUpdateOrderDeliveryFeeMutation } from "@/features/orders/hooks/useOrderMutations";

const deliveryFeeSchema = z.object({ deliveryFee: z.string() });

interface OrderDeliveryFeeFormProps {
	orderId: number;
	currentDeliveryFee: string;
	closeDialog: () => void;
}

export const OrderDeliveryFeeForm = ({
	orderId,
	currentDeliveryFee,
	closeDialog,
}: OrderDeliveryFeeFormProps) => {
	const mutation = useUpdateOrderDeliveryFeeMutation(orderId);
	const form = useForm<z.infer<typeof deliveryFeeSchema>>({
		resolver: zodResolver(deliveryFeeSchema),
		defaultValues: { deliveryFee: currentDeliveryFee },
	});

	const handleSave = form.handleSubmit(async ({ deliveryFee }) => {
		await mutation.mutateAsync(deliveryFee);
		closeDialog();
	});

	return (
		<form className="grid gap-4" onSubmit={handleSave}>
			<Controller
				control={form.control}
				name="deliveryFee"
				render={({ field, fieldState }) => (
					<Field data-invalid={fieldState.invalid}>
						<FieldLabel className="sr-only" htmlFor="order-delivery-fee">
							Delivery fee
						</FieldLabel>
						<CurrencyInput
							disabled={mutation.isPending}
							id="order-delivery-fee"
							onValueChange={field.onChange}
							value={field.value}
						/>
						<FieldError errors={[fieldState.error]} />
					</Field>
				)}
			/>
			<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
				<Button
					disabled={mutation.isPending}
					onClick={closeDialog}
					type="button"
					variant="outline"
				>
					Go Back
				</Button>
				<Button
					disabled={mutation.isPending || !form.formState.isDirty}
					type="submit"
				>
					{mutation.isPending ? "Saving…" : "Save Delivery Fee"}
				</Button>
			</div>
		</form>
	);
};
