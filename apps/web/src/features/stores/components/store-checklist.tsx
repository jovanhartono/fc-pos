import { Checkbox } from "@/components/ui/checkbox";
import { FieldLegend, FieldSet } from "@/components/ui/field";

interface StoreChecklistProps {
	idPrefix: string;
	stores: Array<{ id: number; name: string }>;
	value: number[];
	onChange: (value: number[]) => void;
	disabled?: boolean;
}

// Store name left, tick right, one row per Store, like an iOS checklist.
export const StoreChecklist = ({
	idPrefix,
	stores,
	value,
	onChange,
	disabled,
}: StoreChecklistProps) => (
	<FieldSet className="col-span-full gap-0">
		<FieldLegend variant="label" className="mb-2 font-normal">
			Stores
		</FieldLegend>
		<div className="divide-y overflow-hidden rounded-lg border bg-card">
			{stores.map((store) => {
				const id = `${idPrefix}-${store.id}`;
				return (
					<label
						className="flex min-h-11 items-center justify-between gap-3 px-3 text-body"
						htmlFor={id}
						key={store.id}
					>
						{store.name}
						<Checkbox
							checked={value.includes(store.id)}
							disabled={disabled}
							id={id}
							onCheckedChange={(checked) =>
								onChange(
									checked
										? [...value, store.id]
										: value.filter((storeId) => storeId !== store.id),
								)
							}
						/>
					</label>
				);
			})}
		</div>
	</FieldSet>
);
