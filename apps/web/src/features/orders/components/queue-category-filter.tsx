import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
		<Tabs
			onValueChange={(value) =>
				onChange(categoryId, value as QueueCategoryMode)
			}
			value={mode}
		>
			<TabsList aria-label="Show or hide this category" className="w-full">
				{MODE_ITEMS.map((item) => (
					<TabsTrigger
						disabled={categoryId === undefined}
						key={item.value}
						value={item.value}
					>
						{item.label}
					</TabsTrigger>
				))}
			</TabsList>
		</Tabs>
	</div>
);
