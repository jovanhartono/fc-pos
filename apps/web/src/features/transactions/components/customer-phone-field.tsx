import {
	isValidPhoneNumber,
	normalizePhoneNumber,
} from "@fresclean/api/schema";
import { AsYouType, parseIncompletePhoneNumber } from "libphonenumber-js";
import { useLayoutEffect, useRef, useState } from "react";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

interface CustomerPhoneFieldProps {
	value: string;
	onValueChange: (nextValue: string) => void;
	error?: { message?: string };
}

export const CustomerPhoneField = ({
	value,
	onValueChange,
	error,
}: CustomerPhoneFieldProps) => {
	const inputRef = useRef<HTMLInputElement>(null);
	// Digits before the caret, kept so an edit mid-number doesn't throw the
	// caret to the end when the dashes move.
	const caretDigitsRef = useRef<number | null>(null);
	const [hasLeftField, setHasLeftField] = useState(false);

	// Dashes are display only: the form keeps the digits, stored as +62… on blur.
	const display = new AsYouType("ID").input(value);
	const digits = parseIncompletePhoneNumber(value);

	useLayoutEffect(() => {
		const input = inputRef.current;
		const caretDigits = caretDigitsRef.current;
		if (!input || caretDigits === null) {
			return;
		}
		caretDigitsRef.current = null;
		let position = 0;
		for (let seen = 0; position < display.length && seen < caretDigits; ) {
			if (/[\d+]/.test(display[position] ?? "")) {
				seen++;
			}
			position++;
		}
		input.setSelectionRange(position, position);
	});

	// Quiet while the cashier types; a bad number turns red once they leave
	// the field. Otherwise Create Order's own error shows.
	const shownError =
		hasLeftField && digits && !isValidPhoneNumber(value)
			? { message: "Invalid phone number" }
			: error;
	const isInvalid = Boolean(shownError?.message);

	return (
		<Field data-invalid={isInvalid}>
			<FieldLabel htmlFor="customer-phone" asterisk>
				Phone
			</FieldLabel>
			<Input
				aria-invalid={isInvalid}
				// The cashier types the customer's number; Safari would offer the
				// counter phone's own and file the Order under the wrong Customer.
				autoComplete="off"
				id="customer-phone"
				inputMode="tel"
				onBlur={() => {
					setHasLeftField(true);
					const normalized = normalizePhoneNumber(value);
					if (normalized !== value) {
						onValueChange(normalized);
					}
				}}
				onChange={(event) => {
					const text = event.target.value;
					const caret = event.target.selectionStart ?? text.length;
					let next = parseIncompletePhoneNumber(text);
					let caretDigits = parseIncompletePhoneNumber(
						text.slice(0, caret),
					).length;
					// Deleting a dash removes no digit, so the dash would come straight
					// back; take the digit beside it instead.
					if (next === digits && text.length < display.length) {
						const isForward =
							(event.nativeEvent as InputEvent).inputType ===
							"deleteContentForward";
						if (isForward) {
							next = next.slice(0, caretDigits) + next.slice(caretDigits + 1);
						} else if (caretDigits > 0) {
							next = next.slice(0, caretDigits - 1) + next.slice(caretDigits);
							caretDigits--;
						}
					}
					caretDigitsRef.current = caretDigits;
					setHasLeftField(false);
					onValueChange(next);
				}}
				placeholder="e.g. 0812-3456-7890"
				ref={inputRef}
				type="tel"
				value={display}
			/>
			<FieldError errors={[shownError]} />
		</Field>
	);
};
