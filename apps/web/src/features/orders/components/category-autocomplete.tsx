import { useQuery } from "@tanstack/react-query";
import { Combobox } from "@/components/ui/combobox";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { categoriesQueries } from "@/features/categories/api";

type CategoryAutocompleteProps = {
	value: string;
	onValueChange: (value: string) => void;
	disabled?: boolean;
	required?: boolean;
	error?: { message?: string };
	id?: string;
	allOptionLabel?: string;
};

export function CategoryAutocomplete({
	value,
	onValueChange,
	disabled,
	required,
	error,
	id = "entity-category",
	allOptionLabel,
}: CategoryAutocompleteProps) {
	const { data: categories = [], isPending } = useQuery(
		categoriesQueries.list(),
	);

	const options = categories.map((category) => ({
		value: String(category.id),
		label: category.name,
	}));
	if (allOptionLabel) {
		options.unshift({ value: "", label: allOptionLabel });
	}

	return (
		<Field data-invalid={!!error}>
			<FieldLabel htmlFor={id} asterisk={required}>
				Category
			</FieldLabel>
			<Combobox
				id={id}
				required={required}
				triggerClassName="h-10 w-full text-sm"
				options={options}
				value={value}
				onValueChange={onValueChange}
				loading={isPending}
				placeholder={allOptionLabel ?? "Select category"}
				searchPlaceholder="Search categories"
				emptyText="No category found"
				disabled={disabled}
			/>
			<FieldError errors={[error]} />
		</Field>
	);
}
