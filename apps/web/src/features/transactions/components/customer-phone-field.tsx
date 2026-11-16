import {
	isValidPhoneNumber,
	normalizePhoneNumber,
} from "@fresclean/api/schema";
import { AsYouType } from "libphonenumber-js";
import { useLayoutEffect, useRef, useState } from "react";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { pluralize } from "@/shared/utils";

const HINT_ID = "customer-phone-hint";

// Spaces and dashes are display only: the form keeps the digits as typed, and
// the number is stored as +62… on blur, as before.
const toPhoneDigits = (text: string) =>
	text.replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");

// The fewest digits that still make a valid number, so "0812" reads "5 more".
const countDigitsLeft = (digits: string): number | null => {
	for (let extra = 1; extra <= 13; extra++) {
		if (isValidPhoneNumber(digits + "1".repeat(extra))) {
			return extra;
		}
	}
	return null;
};

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

	const display = new AsYouType("ID").input(value);
	const digits = toPhoneDigits(value);
	const isValid = isValidPhoneNumber(value);
	const digitsLeft = digits && !isValid ? countDigitsLeft(digits) : null;

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

	// Quiet while the cashier types; a short number turns red only once they
	// leave the field.
	const left = digitsLeft
		? `at least ${pluralize(digitsLeft, "more digit", "more digits")}`
		: "";
	let message = "";
	if (digits && !isValid) {
		if (!hasLeftField) {
			message = left && `Needs ${left}`;
		} else {
			message = left ? `Too short. Add ${left}.` : "Invalid phone number";
		}
	} else if (error?.message) {
		// Create Order refused the number, or it was never filled in.
		message = error.message;
	}
	const isInvalid =
		message !== "" && (hasLeftField || message === error?.message);

	return (
		<Field data-invalid={isInvalid}>
			<FieldLabel htmlFor="customer-phone" asterisk>
				Phone
			</FieldLabel>
			<Input
				aria-describedby={HINT_ID}
				aria-invalid={isInvalid}
				autoComplete="tel"
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
					let next = toPhoneDigits(text);
					let caretDigits = toPhoneDigits(text.slice(0, caret)).length;
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
			{/* Always one line tall, so the hint coming and going never moves the
			    Name field below on a phone. */}
			<p
				className={cn(
					"text-footnote",
					isInvalid ? "text-destructive" : "text-muted-foreground",
					!message && "invisible",
				)}
				id={HINT_ID}
			>
				{message || " "}
			</p>
		</Field>
	);
};
