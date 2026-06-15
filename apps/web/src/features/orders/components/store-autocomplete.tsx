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
	hideLabel?: boolean;
	id?: string;
	error?: { message?: string };
	placeholder?: string;
	triggerClassName?: string;
	allOptionLabel?: string;
};

export function StoreAutocomplete({
	value,
	onValueChange,
	allowedStoreIds,
	disabled,
	required,
	label = "Store",
	hideLabel = false,
	id = "order-store",
	error,
	placeholder = "Select store",
	triggerClassName = "h-10 w-full text-sm",
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
		label: `${store.code} - ${store.name}`,
	}));
	if (allOptionLabel) {
		options.unshift({ value: "", label: allOptionLabel });
	}

	const combobox = (
		<Combobox
			id={id}
			required={required}
			triggerClassName={triggerClassName}
			options={options}
			value={value}
			onValueChange={onValueChange}
			loading={isPending}
			placeholder={placeholder}
			searchPlaceholder="Search store..."
			emptyText="No store found"
			disabled={disabled}
		/>
	);

	if (hideLabel) {
		return combobox;
	}

	return (
		<Field data-invalid={!!error}>
			<FieldLabel htmlFor={id} asterisk={required}>
				{label}
			</FieldLabel>
			{combobox}
			<FieldError errors={[error]} />
		</Field>
	);
}
