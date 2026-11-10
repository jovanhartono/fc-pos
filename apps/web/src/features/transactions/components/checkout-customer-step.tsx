import { useQuery } from "@tanstack/react-query";
import { Controller, useFormContext } from "react-hook-form";
import { SelectField } from "@/components/form/select-field";
import type { ComboboxOption } from "@/components/ui/combobox";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import type { TransactionDraftValues } from "@/features/transactions/cart/cart";
import { CustomerFields } from "@/features/transactions/components/customer-fields";
import { usersQueries } from "@/features/users/api";

export const CheckoutCustomerStep = () => {
	const form = useFormContext<TransactionDraftValues>();

	const couriersQuery = useQuery(usersQueries.couriers());
	const courierOptions: ComboboxOption[] = [
		{ value: "none", label: "Walk-in (no courier)" },
		...(couriersQuery.data ?? []).map((courier) => ({
			value: String(courier.id),
			label: courier.name,
		})),
	];

	return (
		<div className="grid gap-5">
			<CustomerFields />
			<Controller
				control={form.control}
				name="selectedCourierId"
				render={({ field, fieldState }) => (
					<Field data-invalid={fieldState.invalid}>
						<FieldLabel htmlFor="transaction-courier">
							Collected by courier
						</FieldLabel>
						<SelectField
							className="w-full"
							id="transaction-courier"
							items={courierOptions}
							onValueChange={(value) =>
								field.onChange(value === "none" ? "" : value)
							}
							placeholder="Walk-in (no courier)"
							value={field.value || "none"}
						/>
						<FieldError errors={[fieldState.error]} />
					</Field>
				)}
			/>
		</div>
	);
};
