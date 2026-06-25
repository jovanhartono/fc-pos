import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { SelectField } from "@/components/form/select-field";
import type { ComboboxOption } from "@/components/ui/combobox";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import type { TransactionDraftValues } from "@/features/transactions/cart/cart";
import { CustomerFields } from "@/features/transactions/components/customer-fields";
import { usersPageQueryOptions } from "@/lib/query-options";

// Step ① — who/how the items arrived: customer identity (phone-lookup prefill)
// plus the courier who collected them, or walk-in. Gated forward on name + a
// valid phone (see CheckoutFooter).
export const CheckoutCustomerStep = () => {
	const form = useFormContext<TransactionDraftValues>();

	const couriersQuery = useQuery({
		...usersPageQueryOptions({ role: "courier", is_active: true }),
		// Couriers are slow-changing reference data; cache like the other reference
		// lists so reopening checkout doesn't refetch the roster every time. The
		// customer step now mounts on every open, so an uncached query refetched
		// on each one.
		staleTime: 5 * 60 * 1000,
	});
	const courierOptions = useMemo<ComboboxOption[]>(
		() => [
			{ value: "none", label: "Walk-in (no courier)" },
			...(couriersQuery.data?.items ?? []).map((courier) => ({
				value: String(courier.id),
				label: courier.name,
			})),
		],
		[couriersQuery.data],
	);

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
							className="w-full text-sm"
							id="transaction-courier"
							items={courierOptions}
							onValueChange={(value) =>
								field.onChange(value === "none" ? "" : value)
							}
							placeholder="Walk-in (no courier)"
							size="lg"
							value={field.value || "none"}
						/>
						<FieldError errors={[fieldState.error]} />
					</Field>
				)}
			/>
		</div>
	);
};
