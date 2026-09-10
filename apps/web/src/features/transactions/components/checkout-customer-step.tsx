import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SelectField } from "@/components/form/select-field";
import type { ComboboxOption } from "@/components/ui/combobox";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { PostalCodeAutocomplete } from "@/features/orders/components/postal-code-autocomplete";
import {
	INTAKE_CHANNEL_ITEMS,
	intakeChannelCarries,
} from "@/features/orders/lib/intake-channel";
import type { TransactionDraftValues } from "@/features/transactions/cart/cart";
import { CustomerFields } from "@/features/transactions/components/customer-fields";
import type { IntakeChannel } from "@/lib/api";
import { usersPageQueryOptions } from "@/lib/query-options";

// Step ① — who dropped the items off and how they got here: customer identity
// (phone-lookup prefill), the way they arrived, and for anything that did not
// come over the counter, where from. Gated forward on name + a valid phone
// (see CheckoutFooter).
export const CheckoutCustomerStep = () => {
	const form = useFormContext<TransactionDraftValues>();
	const [intakeChannel = "walk_in"] = useWatch<
		TransactionDraftValues,
		["intakeChannel"]
	>({ name: ["intakeChannel"] });
	const carries = intakeChannelCarries(intakeChannel);

	const couriersQuery = useQuery({
		...usersPageQueryOptions({ role: "courier", is_active: true }),
		// Couriers are slow-changing reference data; cache like the other reference
		// lists so reopening checkout doesn't refetch the roster every time. The
		// customer step now mounts on every open, so an uncached query refetched
		// on each one.
		staleTime: 5 * 60 * 1000,
	});
	const courierOptions = useMemo<ComboboxOption[]>(
		() =>
			(couriersQuery.data?.items ?? []).map((courier) => ({
				value: String(courier.id),
				label: courier.name,
			})),
		[couriersQuery.data],
	);

	const handleChannelChange = (value: string) => {
		const next = value as IntakeChannel;
		const nextCarries = intakeChannelCarries(next);
		form.setValue("intakeChannel", next);
		if (!nextCarries.courier) {
			form.setValue("selectedCourierId", "");
		}
		if (!nextCarries.origin) {
			form.setValue("originPostalCode", "");
		}
	};

	return (
		<div className="grid gap-5">
			<CustomerFields />
			<Controller
				control={form.control}
				name="intakeChannel"
				render={({ field, fieldState }) => (
					<Field data-invalid={fieldState.invalid}>
						<FieldLabel htmlFor="transaction-intake-channel">
							How it arrived
						</FieldLabel>
						<SelectField
							className="w-full text-sm"
							id="transaction-intake-channel"
							items={INTAKE_CHANNEL_ITEMS}
							onValueChange={handleChannelChange}
							size="lg"
							value={field.value}
						/>
						<FieldError errors={[fieldState.error]} />
					</Field>
				)}
			/>

			{carries.courier ? (
				<Controller
					control={form.control}
					name="selectedCourierId"
					render={({ field, fieldState }) => (
						<Field data-invalid={fieldState.invalid}>
							<FieldLabel htmlFor="transaction-courier">Courier</FieldLabel>
							<SelectField
								className="w-full text-sm"
								id="transaction-courier"
								items={courierOptions}
								onValueChange={field.onChange}
								placeholder="Pick the courier who collected it"
								size="lg"
								value={field.value}
							/>
							<FieldError errors={[fieldState.error]} />
						</Field>
					)}
				/>
			) : null}

			{carries.origin ? (
				<Controller
					control={form.control}
					name="originPostalCode"
					render={({ field, fieldState }) => (
						<PostalCodeAutocomplete
							error={fieldState.error}
							label="Where from (kode pos, optional)"
							onValueChange={field.onChange}
							value={field.value}
						/>
					)}
				/>
			) : null}
		</div>
	);
};
