import { useQuery } from "@tanstack/react-query";
import { Combobox } from "@/components/ui/combobox";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { fetchCategories, queryKeys } from "@/lib/api";

type CategoryAutocompleteProps = {
	value: string;
	onValueChange: (value: string) => void;
	disabled?: boolean;
	required?: boolean;
	error?: { message?: string };
};

export function CategoryAutocomplete({
	value,
	onValueChange,
	disabled,
	required,
	error,
}: CategoryAutocompleteProps) {
	const { data: categories = [], isPending } = useQuery({
		queryKey: queryKeys.categories,
		queryFn: fetchCategories,
	});

	return (
		<Field data-invalid={!!error}>
			<FieldLabel htmlFor="entity-category" asterisk={required}>
				Category
			</FieldLabel>
			<Combobox
				id="entity-category"
				required={required}
				triggerClassName="h-10 w-full text-sm"
				options={categories.map((category) => ({
					value: String(category.id),
					label: category.name,
				}))}
				value={value}
				onValueChange={onValueChange}
				loading={isPending}
				placeholder="Select category"
				searchPlaceholder="Search category..."
				emptyText="No category found"
				disabled={disabled}
			/>
			<FieldError errors={[error]} />
		</Field>
	);
}
