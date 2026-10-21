import { Button } from "@/components/ui/button";
import type { QueueCategoryMode } from "@/features/orders/api";
import { CategoryAutocomplete } from "@/features/orders/components/category-autocomplete";

const MODE_ITEMS: { value: QueueCategoryMode; label: string }[] = [
	{ value: "only", label: "Only" },
	{ value: "except", label: "Except" },
];

interface QueueCategoryFilterProps {
	categoryId?: number;
	mode: QueueCategoryMode;
	onChange: (categoryId: number | undefined, mode: QueueCategoryMode) => void;
}

export const QueueCategoryFilter = ({
	categoryId,
	mode,
	onChange,
}: QueueCategoryFilterProps) => (
	<div className="grid gap-2">
		<CategoryAutocomplete
			allOptionLabel="All categories"
			id="queue-category"
			onValueChange={(value) =>
				onChange(value ? Number(value) : undefined, mode)
			}
			value={categoryId?.toString() ?? ""}
		/>
		{/* Always drawn, disabled until a category is picked, so picking one
		    doesn't push the Date field down under the worker's finger. */}
		<fieldset
			className="grid grid-cols-2 gap-2 border-0 p-0"
			disabled={categoryId === undefined}
		>
			<legend className="sr-only">Show or hide this category</legend>
			{MODE_ITEMS.map((item) => (
				<Button
					aria-pressed={mode === item.value}
					size="lg"
					disabled={categoryId === undefined}
					key={item.value}
					onClick={() => onChange(categoryId, item.value)}
					type="button"
					variant={mode === item.value ? "default" : "outline"}
				>
					{item.label}
				</Button>
			))}
		</fieldset>
	</div>
);
