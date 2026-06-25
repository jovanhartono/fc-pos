import { CheckCircleIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { PhoneNumberField } from "@/components/form/phone-number-field";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { TransactionDraftValues } from "@/features/transactions/cart/cart";
import { fetchCustomerByPhone } from "@/lib/api";
import { isValidPhoneNumber, normalizePhoneNumber } from "@/lib/phone-number";
import { cn } from "@/lib/utils";

// POS customer entry — two always-visible fields. The cashier enters the phone;
// a debounced exact lookup prefills + locks the name when that phone already
// exists (returning), or leaves it open to type (new). No id is resolved here —
// the server find-or-creates by phone at checkout. See ADR-0011.
export const CustomerFields = () => {
	const form = useFormContext<TransactionDraftValues>();
	const [phone = ""] = useWatch<TransactionDraftValues, ["customerPhone"]>({
		name: ["customerPhone"],
	});

	// Only look up once the input is a valid phone; partial numbers never match
	// the stored E.164 form, so querying them is pure noise.
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
		queryKey: ["customer-by-phone", lookupPhone],
		queryFn: () => fetchCustomerByPhone(lookupPhone),
		enabled: lookupPhone.length > 0,
		// A phone→customer mapping is stable; cache it so re-looking-up the same
		// phone (e.g. after a cart↔payment tab toggle remounts this field) is
		// instant instead of refetching and flashing the name/badge.
		staleTime: 5 * 60 * 1000,
	});

	// Exact-phone lookup returns the Customer or null directly — phone is
	// identity, so no client-side disambiguation needed.
	const match = lookupQuery.data ?? null;

	const isReturning = match !== null;

	// Sync the name field to the lookup: fill+lock once per matched phone, clear
	// once when the match goes away. Keyed by phone so a refetch returning the
	// same customer doesn't clobber on every render.
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
		<div className="grid gap-4">
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
						inputClassName="h-11"
					/>
				)}
			/>
			<Controller
				name="customerName"
				control={form.control}
				render={({ field, fieldState }) => (
					<Field data-invalid={fieldState.invalid}>
						{/* Status lives in the label row, not below the input — the lookup
						    resolves async, and inserting a line under the field shifted the
						    whole cart (CLS). The label row has fixed height, so the badge
						    toggles in place. */}
						<div className="flex items-center gap-2">
							<FieldLabel htmlFor="customer-name" asterisk>
								Name
							</FieldLabel>
							{/* Always mounted; hidden until the lookup confirms a returning
							    customer. Reserving the badge's height keeps the row from
							    growing when it toggles in (CLS). */}
							<span
								className={cn(
									"flex items-center gap-1 border border-emerald-300/60 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400",
									!isReturning && "invisible",
								)}
							>
								<CheckCircleIcon className="size-3.5" weight="fill" />
								Existing customer
							</span>
						</div>
						<Input
							id="customer-name"
							className="h-11"
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
