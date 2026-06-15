import type { ReactNode } from "react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

type SelectFieldItems =
	| Record<string, ReactNode>
	| ReadonlyArray<{ value: string; label: ReactNode }>;

interface SelectFieldProps {
	items: SelectFieldItems;
	value: string;
	onValueChange: (value: string) => void;
	placeholder?: string;
	size?: "sm" | "default" | "md" | "lg";
	className?: string;
	id?: string;
	disabled?: boolean;
	"aria-label"?: string;
}

// Flat single-select over the Base UI Select primitives. `items` is the single
// source for both the value→label map (so the trigger shows the label, not the
// raw value, even before the popup opens) and the rendered options. For grouped
// menus, separators, or custom item rows, drop down to the Select* primitives.
export const SelectField = ({
	items,
	value,
	onValueChange,
	placeholder,
	size = "md",
	className,
	id,
	disabled,
	"aria-label": ariaLabel,
}: SelectFieldProps) => {
	const entries = Array.isArray(items)
		? items
		: Object.entries(items).map(([entryValue, label]) => ({
				value: entryValue,
				label,
			}));

	return (
		<Select
			items={items}
			value={value}
			onValueChange={onValueChange}
			disabled={disabled}
		>
			<SelectTrigger
				id={id}
				size={size}
				className={className}
				aria-label={ariaLabel}
			>
				<SelectValue placeholder={placeholder} />
			</SelectTrigger>
			<SelectContent>
				{entries.map((entry) => (
					<SelectItem key={entry.value} value={entry.value}>
						{entry.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
};
