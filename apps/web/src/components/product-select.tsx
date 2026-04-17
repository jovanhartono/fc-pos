import { useQuery } from "@tanstack/react-query";
import { Combobox } from "@/components/ui/combobox";
import { Label } from "@/components/ui/label";
import { fetchProducts, queryKeys } from "@/lib/api";

type ProductSelectProps = {
	id?: string;
	label?: string;
	value: string;
	onValueChange: (value: string) => void;
	disabled?: boolean;
	required?: boolean;
};

export function ProductSelect({
	id = "product-select",
	label = "Product",
	value,
	onValueChange,
	disabled,
	required,
}: ProductSelectProps) {
	const { data: products = [], isPending } = useQuery({
		queryKey: queryKeys.products,
		queryFn: fetchProducts,
	});

	return (
		<div className="grid gap-2">
			<Label htmlFor={id}>{label}</Label>
			<Combobox
				id={id}
				required={required}
				triggerClassName="h-10 w-full text-sm"
				options={products.map((product) => ({
					value: String(product.id),
					label: `${product.name} (${product.sku})`,
				}))}
				value={value}
				onValueChange={onValueChange}
				loading={isPending}
				placeholder="Select product"
				searchPlaceholder="Search product..."
				emptyText="No product found"
				disabled={disabled}
			/>
		</div>
	);
}
