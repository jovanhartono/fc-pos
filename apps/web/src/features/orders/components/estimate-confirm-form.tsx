import { zodResolver } from "@hookform/resolvers/zod";
import { CheckIcon } from "@phosphor-icons/react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { CurrencyInput } from "@/components/form/currency-input";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { useConfirmEstimateMutation } from "@/features/orders/hooks/useOrderMutations";

const confirmEstimateSchema = z.object({
	// Zero is deliberately free (a Rework), never a settled repair price.
	price: z
		.string()
		.trim()
		.refine((value) => Number(value) > 0, "Final price is required."),
});

type ConfirmEstimateValues = z.infer<typeof confirmEstimateSchema>;

interface EstimateConfirmFormProps {
	orderId: number;
	serviceId: number;
	estimatedPrice: string;
}

// ADR-0018: confirming an Estimate is open to any staff — the oversight is
// the server-side price log (estimate vs final, by user), not a role gate.
// Prefilled with the intake number; most finals land on the estimate.
export const EstimateConfirmForm = ({
	orderId,
	serviceId,
	estimatedPrice,
}: EstimateConfirmFormProps) => {
	const confirmMutation = useConfirmEstimateMutation(orderId);
	const form = useForm<ConfirmEstimateValues>({
		resolver: zodResolver(confirmEstimateSchema),
		defaultValues: { price: estimatedPrice },
	});

	return (
		<form
			className="grid gap-3"
			// mutate, not mutateAsync: if someone else settled or cancelled this
			// line first, the global handler shows the server's reason. Awaiting
			// it here throws instead, leaving staff with a spinner that stops
			// and no message.
			onSubmit={form.handleSubmit((values) => {
				confirmMutation.mutate({
					serviceId,
					payload: { price: values.price },
				});
			})}
		>
			<Controller
				control={form.control}
				name="price"
				render={({ field, fieldState }) => (
					<Field data-invalid={fieldState.invalid}>
						<FieldLabel asterisk htmlFor={`estimate-final-${serviceId}`}>
							Final price
						</FieldLabel>
						<CurrencyInput
							id={`estimate-final-${serviceId}`}
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
				loading={confirmMutation.isPending}
				type="submit"
			>
				Confirm price
			</Button>
		</form>
	);
};
