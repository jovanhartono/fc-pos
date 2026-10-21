import {
	isValidPhoneNumber,
	normalizePhoneNumber,
} from "@fresclean/api/schema";
import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { PhoneNumberField } from "@/components/form/phone-number-field";
import { Badge } from "@/components/ui/badge";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { customersQueries } from "@/features/customers/api";
import type { TransactionDraftValues } from "@/features/transactions/cart/cart";
import { cn } from "@/lib/utils";

// A returning Customer's phone fills and locks the name; a new one types it.
// The server finds or creates the Customer by phone at checkout (ADR-0011).
export const CustomerFields = () => {
	const form = useFormContext<TransactionDraftValues>();
	const [phone = ""] = useWatch<TransactionDraftValues, ["customerPhone"]>({
		name: ["customerPhone"],
	});

	// A half-typed number can never match a stored phone, so it isn't looked up.
	const [lookupPhone, setLookupPhone] = useState("");
	useEffect(() => {
		const timeoutId = window.setTimeout(() => {
			setLookupPhone(
				isValidPhoneNumber(phone) ? normalizePhoneNumber(phone) : "",
			);
		}, 300);
		return () => window.clearTimeout(timeoutId);
	}, [phone]);

	const lookupQuery = useQuery({
		...customersQueries.byPhone(lookupPhone),
		enabled: lookupPhone.length > 0,
	});

	const match = lookupQuery.data ?? null;

	const isReturning = match !== null;

	// Filled once per matched phone, so a refetch doesn't overwrite the name on
	// every render.
	const appliedPhoneRef = useRef<string | null>(null);
	useEffect(() => {
		if (match) {
			if (appliedPhoneRef.current !== match.phone_number) {
				form.setValue("customerName", match.name, { shouldValidate: true });
				appliedPhoneRef.current = match.phone_number;
			}
			return;
		}
		if (appliedPhoneRef.current !== null) {
			form.setValue("customerName", "");
			appliedPhoneRef.current = null;
		}
	}, [match, form]);

	return (
		<div className="grid gap-4 sm:grid-cols-2">
			<Controller
				name="customerPhone"
				control={form.control}
				render={({ field, fieldState }) => (
					<PhoneNumberField
						id="customer-phone"
						label="Phone"
						value={field.value}
						onValueChange={field.onChange}
						required
						error={fieldState.error}
					/>
				)}
			/>
			<Controller
				name="customerName"
				control={form.control}
				render={({ field, fieldState }) => (
					<Field data-invalid={fieldState.invalid}>
						{/* In the label row, not below the input: a line appearing under
						    the field once the lookup returned shifted the whole Cart. */}
						<div className="flex items-center gap-2">
							<FieldLabel htmlFor="customer-name" asterisk>
								Name
							</FieldLabel>
							{/* Always mounted, so the row keeps its height when a returning
							    Customer's badge appears. */}
							<Badge
								variant="success"
								className={cn(
									// sm:-my-1: beside Phone, a taller label row would drop
									// this input below the phone input.
									"sm:-my-1",
									!isReturning && "invisible",
								)}
							>
								<HugeiconsIcon icon={CheckmarkCircle02Icon} />
								Existing customer
							</Badge>
						</div>
						<Input
							id="customer-name"
							value={field.value}
							onChange={field.onChange}
							readOnly={isReturning}
							aria-invalid={fieldState.invalid}
							placeholder="e.g. Budi Santoso"
						/>
						<FieldError errors={[fieldState.error]} />
					</Field>
				)}
			/>
		</div>
	);
};
