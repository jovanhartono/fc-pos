import { Field, FieldLabel } from "@/components/ui/field";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface SegmentedFilterProps<T extends string> {
	id: string;
	label: string;
	// The first segment ("All", "Auto") means no filter and reads as undefined.
	emptyValue?: string;
	options: readonly (readonly [string, string])[];
	value?: T;
	onValueChange: (value: T | undefined) => void;
}

export const SegmentedFilter = <T extends string>({
	id,
	label,
	emptyValue = "all",
	options,
	value,
	onValueChange,
}: SegmentedFilterProps<T>) => (
	<Field>
		<FieldLabel id={id}>{label}</FieldLabel>
		<Tabs
			value={value ?? emptyValue}
			onValueChange={(next) =>
				onValueChange(next === emptyValue ? undefined : (next as T))
			}
		>
			<TabsList aria-labelledby={id} className="w-full">
				{options.map(([optionValue, optionLabel]) => (
					<TabsTrigger key={optionValue} value={optionValue}>
						{optionLabel}
					</TabsTrigger>
				))}
			</TabsList>
		</Tabs>
	</Field>
);
