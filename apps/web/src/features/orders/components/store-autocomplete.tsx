import { useQuery } from "@tanstack/react-query";
import { Combobox } from "@/components/ui/combobox";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { fetchStores, queryKeys } from "@/lib/api";

type StoreAutocompleteProps = {
	value: string;
	onValueChange: (value: string) => void;
	allowedStoreIds?: number[];
	disabled?: boolean;
	required?: boolean;
	label?: string;
	id?: string;
	error?: { message?: string };
	placeholder?: string;
	allOptionLabel?: string;
};

export function StoreAutocomplete({
	value,
	onValueChange,
	allowedStoreIds,
	disabled,
	required,
	label = "Store",
	id = "order-store",
	error,
	placeholder = "Select store",
	allOptionLabel,
}: StoreAutocompleteProps) {
	const { data: stores = [], isPending } = useQuery({
		queryKey: queryKeys.stores,
		queryFn: fetchStores,
	});
	const filteredStores = allowedStoreIds
		? stores.filter((store) => allowedStoreIds.includes(store.id))
		: stores;

	const options = filteredStores.map((store) => ({
		value: String(store.id),
		label: store.name,
	}));
	if (allOptionLabel) {
		options.unshift({ value: "", label: allOptionLabel });
	}

	return (
		<Field data-invalid={!!error}>
			<FieldLabel htmlFor={id} asterisk={required}>
				{label}
			</FieldLabel>
			<Combobox
				id={id}
				required={required}
				triggerClassName="h-10 w-full text-sm"
				options={options}
				value={value}
				onValueChange={onValueChange}
				loading={isPending}
				placeholder={placeholder}
				searchPlaceholder="Search store..."
				emptyText="No store found"
				disabled={disabled}
			/>
			<FieldError errors={[error]} />
		</Field>
	);
}
