import { useQuery } from "@tanstack/react-query";
import { Combobox } from "@/components/ui/combobox";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { fetchStores, queryKeys } from "@/lib/api";

type StoreAutocompleteProps = {
	value: string;
	onValueChange: (value: string) => void;
	disabled?: boolean;
	required?: boolean;
	label?: string;
	id?: string;
	error?: { message?: string };
};

export function StoreAutocomplete({
	value,
	onValueChange,
	disabled,
	required,
	label = "Store",
	id = "order-store",
	error,
}: StoreAutocompleteProps) {
	const { data: stores = [], isPending } = useQuery({
		queryKey: queryKeys.stores,
		queryFn: fetchStores,
	});

	return (
		<Field data-invalid={!!error}>
			<FieldLabel htmlFor={id}>{label}</FieldLabel>
			<Combobox
				id={id}
				required={required}
				triggerClassName="h-10 w-full text-sm"
				options={stores.map((store) => ({
					value: String(store.id),
					label: store.name,
				}))}
				value={value}
				onValueChange={onValueChange}
				loading={isPending}
				placeholder="Select store"
				searchPlaceholder="Search store..."
				emptyText="No store found"
				disabled={disabled}
			/>
			<FieldError errors={[error]} />
		</Field>
	);
}
