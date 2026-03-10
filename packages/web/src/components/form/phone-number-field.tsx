import type { CountryCode } from "libphonenumber-js";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { normalizePhoneNumber } from "@/lib/phone-number";

type PhoneNumberFieldProps = {
	id: string;
	label: string;
	value: string;
	onValueChange: (nextValue: string) => void;
	placeholder?: string;
	disabled?: boolean;
	required?: boolean;
	error?: { message?: string };
	defaultCountry?: CountryCode;
};

export function PhoneNumberField({
	id,
	label,
	value,
	onValueChange,
	placeholder = "e.g. +628123456789",
	disabled,
	required,
	error,
	defaultCountry = "ID",
}: PhoneNumberFieldProps) {
	return (
		<Field data-invalid={!!error}>
			<FieldLabel htmlFor={id} asterisk={required}>
				{label}
			</FieldLabel>
			<Input
				id={id}
				type="tel"
				inputMode="tel"
				autoComplete="tel"
				placeholder={placeholder}
				value={value}
				onChange={(event) => onValueChange(event.target.value)}
				onBlur={() => {
					const normalized = normalizePhoneNumber(value, defaultCountry);
					if (normalized !== value) {
						onValueChange(normalized);
					}
				}}
				aria-invalid={!!error}
				disabled={disabled}
				className="h-10"
			/>
			<FieldError errors={[error]} />
		</Field>
	);
}
