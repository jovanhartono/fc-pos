import { useQuery } from "@tanstack/react-query";
import { Combobox } from "@/components/ui/combobox";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { fetchProducts, queryKeys } from "@/lib/api";

type ProductAutocompleteProps = {
	id?: string;
	label?: string;
	value: string;
	onValueChange: (value: string) => void;
	disabled?: boolean;
	error?: { message?: string };
};

export function ProductAutocomplete({
	id = "order-product",
	label = "Product (optional)",
	value,
	onValueChange,
	disabled,
	error,
}: ProductAutocompleteProps) {
	const { data: products = [], isPending } = useQuery({
		queryKey: queryKeys.products,
		queryFn: fetchProducts,
	});

	return (
		<Field data-invalid={!!error}>
			<FieldLabel htmlFor={id}>{label}</FieldLabel>
			<Combobox
				id={id}
				triggerClassName="h-10 w-full text-sm"
				options={[
					{ value: "none", label: "No product" },
					...products.map((product) => ({
						value: String(product.id),
						label: product.name,
					})),
				]}
				value={value || "none"}
				onValueChange={(nextValue) =>
					onValueChange(!nextValue || nextValue === "none" ? "" : nextValue)
				}
				loading={isPending}
				placeholder="No product"
				searchPlaceholder="Search product..."
				emptyText="No product found"
				disabled={disabled}
			/>
			<FieldError errors={[error]} />
		</Field>
	);
}
