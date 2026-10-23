import { CheckboxGroup } from "@base-ui/react/checkbox-group";
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
	<CheckboxGroup
		disabled={disabled}
		// Rendered as the fieldset itself so the legend names the group, not a second group nested inside.
		render={<FieldSet className="col-span-full gap-0" />}
		value={value.map(String)}
		onValueChange={(next) => onChange(next.map(Number))}
	>
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
						<Checkbox id={id} value={String(store.id)} />
					</label>
				);
			})}
		</div>
	</CheckboxGroup>
);
