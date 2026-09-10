import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Combobox } from "@/components/ui/combobox";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { fetchPostalCodes, queryKeys } from "@/lib/api";

interface PostalCodeAutocompleteProps {
	value: string;
	onValueChange: (value: string) => void;
	disabled?: boolean;
	error?: { message?: string };
	label?: string;
	// What the already-chosen code stands for. The order detail knows it, so
	// reopening the dialog reads "40115 — Bandung Wetan, KOTA BANDUNG" instead
	// of five bare digits nobody can place.
	valueLabel?: string;
}

const formatOption = (postalCode: {
	city: string;
	code: string;
	districts: string;
}) => `${postalCode.code} — ${postalCode.districts}, ${postalCode.city}`;

// Nine thousand codes are too many to ship to a tablet, so the list comes from
// the server as the cashier types — who may have the number off a shipping
// label, or only the place name.
export const PostalCodeAutocomplete = ({
	value,
	onValueChange,
	disabled,
	error,
	label = "Origin (kode pos)",
	valueLabel,
}: PostalCodeAutocompleteProps) => {
	const [input, setInput] = useState("");
	const [search, setSearch] = useState("");

	useEffect(() => {
		const timeoutId = window.setTimeout(() => setSearch(input.trim()), 300);
		return () => window.clearTimeout(timeoutId);
	}, [input]);

	const { data: postalCodes = [], isFetching } = useQuery({
		queryKey: queryKeys.postalCodes(search),
		queryFn: () => fetchPostalCodes(search),
		enabled: search.length > 0,
		// The kode pos list never changes, so a repeated search is free.
		staleTime: Number.POSITIVE_INFINITY,
	});

	// The chosen code has to survive an empty search box, or reopening the
	// picker would blank a value the cashier already set.
	const options = postalCodes.map((postalCode) => ({
		value: postalCode.code,
		label: formatOption(postalCode),
	}));
	if (value && !options.some((option) => option.value === value)) {
		options.unshift({ value, label: valueLabel ?? value });
	}

	return (
		<Field data-invalid={!!error}>
			<FieldLabel htmlFor="order-origin-postal-code">{label}</FieldLabel>
			<Combobox
				id="order-origin-postal-code"
				triggerClassName="h-10 w-full text-sm"
				options={options}
				value={value}
				onValueChange={onValueChange}
				onInputChange={setInput}
				loading={isFetching}
				placeholder="Not recorded"
				searchPlaceholder="Type a kode pos or a place…"
				emptyText={
					search.length > 0 ? "No match" : "Type a kode pos or a place…"
				}
				disabled={disabled}
			/>
			<FieldError errors={[error]} />
		</Field>
	);
};
